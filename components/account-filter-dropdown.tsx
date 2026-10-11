'use client'

export type AccountFilterOption={value:string;label:string}

/**
 * Native select works even before hydration: the dropdown can always open,
 * and the existing "Lọc" form button remains a no-JavaScript fallback.
 * Once hydrated, selecting an option applies the current GET filters.
 */
export function AccountFilterDropdown({
  name,value,options,label
}:{name:string;value:string;options:AccountFilterOption[];label:string}){
  return <div className="p1-filter-dropdown">
    <select
      key={name+':'+value}
      name={name}
      className="p1-filter-native"
      aria-label={label}
      defaultValue={value}
      onChange={event=>event.currentTarget.form?.requestSubmit()}
    >
      {options.map(option=><option key={option.value} value={option.value}>
        {option.label}
      </option>)}
    </select>
    <svg className="p1-filter-chevron" aria-hidden="true" width="13" height="13"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  </div>
}
