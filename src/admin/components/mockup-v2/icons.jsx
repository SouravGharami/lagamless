/** Small inline icon set for Mockup Studio v2 (stroke icons, currentColor). */
function Icon({ children, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const EyeOffIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
)
export const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)
export const UnlockIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </Icon>
)
export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
)
export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Icon>
)
export const CopyIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" />
    <path d="M5 15V5h10" />
  </Icon>
)
export const ResetIcon = (p) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" />
  </Icon>
)
export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </Icon>
)
export const ShirtIcon = (p) => (
  <Icon {...p} size={p?.size ?? 40}>
    <path d="M8 3 3 6l2 5 3-1v10h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z" />
  </Icon>
)
