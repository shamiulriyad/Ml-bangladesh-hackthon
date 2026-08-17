using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using DotNetEnv;
using Microsoft.OpenApi;

// One unified prompt now covers both hazard/scene narration and opportunistic text reading —
// the frontend no longer has a Scene/Read Text toggle; it's a single continuous vision loop
// that calls this endpoint automatically every few seconds and speaks whatever comes back.
const string VisionPrompt =
    "তুমি Chokh, দৃষ্টিপ্রতিবন্ধী ব্যবহারকারীর জন্য একটি ক্রমাগত সক্রিয় বাংলা ভাষার AI চোখ। ব্যবহারকারীর ক্যামেরা এই মুহূর্তে যা দেখছে তা বিশ্লেষণ করে শুধু বাংলায়, সর্বোচ্চ ১ থেকে ২টি ছোট বাক্যে বলো। এই ক্রম মেনে চলো: (১) বিপদ থাকলে সবার আগে বলো — যেমন গাড়ি, রিকশা, সিঁড়ি, গর্ত বা বাধা; (২) এরপর সংক্ষেপে দিক ও গুরুত্বপূর্ণ বস্তু বলো এই শব্দ ব্যবহার করে: সামনে, পেছনে, বাম পাশে, ডান পাশে, কাছাকাছি, দূরে; (৩) ছবিতে স্পষ্ট পাঠযোগ্য লেখা (সাইনবোর্ড, লেবেল, প্যাকেট) থাকলে সংক্ষেপে পড়ে শোনাও, যেমন \"এখানে লেখা আছে: ...\"। ছবিতে যা নেই তা কল্পনা করে বলবে না। নিশ্চিত না হলে বলো \"নিশ্চিতভাবে বোঝা যাচ্ছে না\"। কোনো মেডিকেল পরামর্শ, রোগ নির্ণয় বা চিকিৎসা নির্দেশনা দিও না। কোনো ভূমিকা বা মার্কডাউন দিও না।";

const string FallbackMessage = "দুঃখিত, এই মুহূর্তে বুঝতে পারছি না। আবার চেষ্টা করুন।";

// gemini-2.0-flash and pinned gemini-2.5-flash* are both retired for new API keys as of this
// writing; gemini-flash-latest is the alias Google keeps pointed at whatever flash model is
// currently live (resolves to gemini-3.7-flash today), so it won't break again the next time
// a specific version is sunset.
const string GeminiEndpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// Loads a .env file for local dev only (searches this folder and parent folders, so a
// .env at the repo root is picked up even though `dotnet run` executes from
// backend/Chokh.Api). No-ops if no .env file exists anywhere — production (Render) relies
// solely on the real GEMINI_API_KEY environment variable, and .env is never copied into the
// Docker image (.dockerignore excludes it). Never overwrites an already-set env var.
try
{
    Env.TraversePath().Load();
}
catch (FileNotFoundException)
{
    // No .env file found — expected in production.
}

// WebApplication.CreateBuilder wires up static web assets against a physical wwwroot
// directory and throws if it doesn't exist yet (e.g. before the frontend has been built).
Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"));

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddHttpClient();

// Only needed when the frontend is deployed as a separate origin from this backend (e.g. two
// Render services). Same-origin deployments (frontend built into this app's wwwroot) don't
// need CORS at all and FRONTEND_ORIGIN can be left unset. Comma-separate multiple origins.
const string CorsPolicyName = "frontend";
var allowedOrigins = (Environment.GetEnvironmentVariable("FRONTEND_ORIGIN") ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicyName, policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Chokh API",
        Version = "v1",
        Description = "Accessibility API for visually impaired users in Bangladesh — powers " +
                       "a continuous vision loop that describes hazards, spatial position, " +
                       "and visible text from camera frames using Gemini."
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Chokh API v1");
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors(CorsPolicyName);

app.MapPost("/api/describe", async (
    DescribeRequest request,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILoggerFactory loggerFactory) =>
{
    var logger = loggerFactory.CreateLogger("DescribeEndpoint");

    if (string.IsNullOrWhiteSpace(request.ImageBase64))
    {
        return Results.BadRequest(new { error = "imageBase64 is required" });
    }

    // Checks, in order: the GEMINI_API_KEY environment variable (used on Render), then
    // .NET user-secrets (used for local dev via `dotnet user-secrets set GEMINI_API_KEY ...`).
    var apiKey = configuration["GEMINI_API_KEY"];
    if (string.IsNullOrEmpty(apiKey))
    {
        logger.LogError("GEMINI_API_KEY is not set (checked environment variable and user-secrets)");
        return Results.Json(new DescribeResponse(FallbackMessage));
    }

    var geminiRequest = new GeminiRequest
    {
        Contents = new List<GeminiContent>
        {
            new()
            {
                Parts = new List<GeminiPart>
                {
                    new() { Text = VisionPrompt },
                    new()
                    {
                        InlineData = new GeminiInlineData
                        {
                            MimeType = "image/jpeg",
                            Data = request.ImageBase64
                        }
                    }
                }
            }
        },
        GenerationConfig = new GeminiGenerationConfig
        {
            Temperature = 0.3,
            MaxOutputTokens = 100,
            ThinkingConfig = new GeminiThinkingConfig { ThinkingBudget = 0 }
        }
    };

    var client = httpClientFactory.CreateClient();
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));

    try
    {
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, GeminiEndpoint);
        httpRequest.Headers.Add("x-goog-api-key", apiKey);
        httpRequest.Content = JsonContent.Create(geminiRequest, options: JsonOptions());

        var response = await client.SendAsync(httpRequest, cts.Token);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cts.Token);
            logger.LogError("Gemini API error {StatusCode}: {Body}", response.StatusCode, body);
            return Results.Json(new DescribeResponse(FallbackMessage));
        }

        var geminiResponse = await response.Content.ReadFromJsonAsync<GeminiResponse>(JsonOptions(), cts.Token);
        var text = geminiResponse?.Candidates?
            .FirstOrDefault()?.Content?.Parts?
            .FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.Text))?.Text;

        if (string.IsNullOrWhiteSpace(text))
        {
            logger.LogWarning("Gemini response had no text content");
            return Results.Json(new DescribeResponse(FallbackMessage));
        }

        return Results.Json(new DescribeResponse(text.Trim()));
    }
    catch (OperationCanceledException)
    {
        logger.LogWarning("Gemini request timed out");
        return Results.Json(new DescribeResponse(FallbackMessage));
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Unexpected error calling Gemini API");
        return Results.Json(new DescribeResponse(FallbackMessage));
    }
})
.WithName("DescribeImage")
.WithTags("Describe")
.WithSummary("Describe one frame from the continuous vision loop")
.WithDescription(
    "Accepts a base64-encoded JPEG, sends it to Gemini with the hardcoded hazard-first " +
    "Bengali vision prompt (which also opportunistically reads any visible text), and " +
    "returns a short spoken-ready Bengali response. Called automatically every few seconds " +
    "by the frontend's continuous vision loop. Falls back to a fixed Bengali message on any " +
    "error or timeout (>8s).")
.Produces<DescribeResponse>(StatusCodes.Status200OK)
.Produces(StatusCodes.Status400BadRequest);

app.MapFallbackToFile("index.html");

app.Run();

static JsonSerializerOptions JsonOptions() => new()
{
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};

record DescribeRequest(string ImageBase64);

record DescribeResponse(string Text);

class GeminiRequest
{
    [JsonPropertyName("contents")]
    public List<GeminiContent> Contents { get; set; } = new();

    [JsonPropertyName("generationConfig")]
    public GeminiGenerationConfig GenerationConfig { get; set; } = new();
}

class GeminiContent
{
    [JsonPropertyName("parts")]
    public List<GeminiPart> Parts { get; set; } = new();
}

class GeminiPart
{
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("inline_data")]
    public GeminiInlineData? InlineData { get; set; }
}

class GeminiInlineData
{
    [JsonPropertyName("mime_type")]
    public string MimeType { get; set; } = "image/jpeg";

    [JsonPropertyName("data")]
    public string Data { get; set; } = "";
}

class GeminiGenerationConfig
{
    [JsonPropertyName("temperature")]
    public double Temperature { get; set; }

    [JsonPropertyName("maxOutputTokens")]
    public int MaxOutputTokens { get; set; }

    [JsonPropertyName("thinkingConfig")]
    public GeminiThinkingConfig? ThinkingConfig { get; set; }
}

class GeminiThinkingConfig
{
    // 0 disables extended "thinking" — this model line does it by default, which was eating
    // the entire maxOutputTokens budget on reasoning before producing any visible answer.
    [JsonPropertyName("thinkingBudget")]
    public int ThinkingBudget { get; set; }
}

class GeminiResponse
{
    [JsonPropertyName("candidates")]
    public List<GeminiCandidate>? Candidates { get; set; }
}

class GeminiCandidate
{
    [JsonPropertyName("content")]
    public GeminiContent? Content { get; set; }
}
