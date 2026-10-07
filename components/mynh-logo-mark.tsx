export function MynhLogoMark({title='MYNH ERP'}:{title?:string}){
  return <svg
    className="mynh-logo-mark"
    viewBox="0 0 40 40"
    role="img"
    aria-label={title}
  >
    <rect className="mynh-logo-base" x="1" y="1" width="38" height="38" rx="8"/>
    <path
      className="mynh-logo-m"
      d="M8 29V11.5h4.6L20 19l7.4-7.5H32V29h-5.3V19.6L20 26.3l-6.7-6.7V29H8Z"
    />
    <path className="mynh-logo-accent" d="M18.15 10.8h4.15l4.15 4.2-2.8 2.85L20 14.2l-3.65 3.65L13.55 15l4.6-4.2Z"/>
  </svg>
}
