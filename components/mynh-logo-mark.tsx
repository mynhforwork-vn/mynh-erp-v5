export function MynhLogoMark({title='MYNH ERP'}:{title?:string}){
  return <svg
    className="mynh-logo-mark"
    viewBox="0 0 48 40"
    role="img"
    aria-label={title}
  >
    <path
      className="mynh-logo-primary"
      d="M5 31V9h5.4L18 18.1 25.6 9H31v22h-5.2V17.2L18 26.3l-7.8-9.1V31H5Z"
    />
    <path
      className="mynh-logo-secondary"
      d="M34 9h5v8.3l4-4.3v6.5l-4 4.2V31h-5V9Z"
    />
    <path
      className="mynh-logo-accent"
      d="M18 7.2 24.1 14 20.7 17.8 18 14.7l-2.7 3.1L11.9 14 18 7.2Z"
    />
  </svg>
}
