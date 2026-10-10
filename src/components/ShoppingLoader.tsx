/** Lightweight loading illustration, inspired by the supplied Picnic animation. */
export function ShoppingLoader({ message }: { message?: string }) {
  return <div className="sp-truck-loader">
    <svg className="sp-truck" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="123" cy="151" rx="83" ry="5" fill="#e8e9db"/>
      <g className="sp-truck-body">
        <path d="M83 72C61 65 53 45 66 37C78 29 94 39 100 57" fill="#ef9937"/>
        <path d="M76 37Q63 21 48 32Q60 42 76 37" fill="#527b34"/>
        <rect x="114" y="17" width="27" height="71" rx="13" transform="rotate(12 114 17)" fill="#568044"/>
        <path d="M123 22L112 72M132 25L121 77" stroke="#a3b779" strokeWidth="2"/>
        <path d="M86 81C68 59 99 41 109 54C129 50 137 72 120 84" fill="#edcb45"/>
        <path d="M143 77C128 61 132 42 146 45C160 32 177 48 166 69L158 82" fill="#da4238"/>
        <path d="M149 45Q147 32 160 31" stroke="#47703d" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M145 53Q140 64 149 73M155 52Q163 59 156 70" stroke="#ef8170" strokeWidth="3" fill="none" strokeLinecap="round"/>
        <path d="M49 77H151V139H49Z" fill="#f3f0d9"/>
        <path d="M151 91H173Q183 91 190 108L201 124V140H151Z" fill="#293d35"/>
        <path d="M161 97H174L184 117H161Z" fill="#b6caca"/>
        <rect x="191" y="122" width="13" height="14" rx="5" fill="#f3f0d9"/>
        <circle cx="199" cy="125" r="2" fill="#26382e"/>
        <rect x="45" y="135" width="162" height="9" rx="4" fill="#373a35"/>
        <image href="/favicon-picnic.png" x="77" y="87" width="39" height="39"/>
      </g>
      <g fill="#353936" stroke="#fff" strokeWidth="2"><circle cx="78" cy="141" r="14"/><circle cx="175" cy="141" r="14"/></g>
      <g className="sp-truck-wheel" fill="#858c7e"><circle cx="78" cy="141" r="5"/><circle cx="175" cy="141" r="5"/></g>
      <path className="sp-truck-road" d="M22 151H36M209 151H224" stroke="#c7ceba" strokeWidth="3" strokeLinecap="round"/>
    </svg>
    {message && <p role="status">{message}</p>}
  </div>;
}
