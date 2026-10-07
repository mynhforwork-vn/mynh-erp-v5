export function MynhLogoMark({title='MYNH ERP'}:{title?:string}){
  return <svg
    className="mynh-logo-mark"
    viewBox="0 0 40 40"
    role="img"
    aria-label={title}
  >
    <path className="mynh-logo-stroke-primary" d="M7 31V9L20 24"/>
    <path className="mynh-logo-stroke-accent" d="M20 24 33 9V31"/>
  </svg>
}
