export default function VisionToggleButton({ isActive, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`vision-toggle ${isActive ? 'vision-toggle-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
    >
      <span aria-hidden="true">{isActive ? '●' : '👁'}</span>
      {isActive ? 'চোখ চলছে' : 'চোখ চালু করুন'}
    </button>
  )
}
