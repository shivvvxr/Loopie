import React from "react";
const paths = {
  search:
    "M7 2h9v3h3v10h-3v3h-3l7 7 3-3-7-7h-3v-3h3V6h-3V5H8v2H5v6h3v3h5v3H7v-3H3V6h4z",
  more: "M2 10h4v4H2zM10 10h4v4h-4zM18 10h4v4h-4z",
  plus: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z",
  up: "M10 3h4v3h3v3h3v4h-4v-3h-2v12h-4V10H8v3H4V9h3V6h3z",
  copy: "M7 2h14v15h-4v5H2V7h5zM10 5v2h7v7h1V5zM5 10v9h9v-9z",
  play: "M8 5h3v2h3v2h3v2h2v2h-2v2h-3v2h-3v2H8z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  previous: "M5 5h3v14H5zM17 5h3v14h-3v-2h-3v-2h-3v-2H9v-2h2V9h3V7h3z",
  next: "M16 5h3v14h-3zM4 5h3v2h3v2h3v2h2v2h-2v2h-3v2H7v2H4z",
  heart: "M4 4h5v2h6V4h5v2h2v7h-2v3h-3v3h-3v3h-4v-3H7v-3H4v-3H2V6h2z",
  shuffle:
    "M3 5h4v2h3v3h2V7h3V5h3V2h3v9h-9v-2h-2v5h2v2h3v2h3v-3h3v9h-9v-3H9v-3H7v-2H3v-3h4v-2H3z",
  repeat:
    "M6 4h10V1h3v3h3v3h-3v3h-3V7H6v3H3V7h3zM18 17v-3h3v6h-3v3H8v-3H5v-3h3v-3h3v3z",
  volume: "M2 9h4V6h3V3h3v18H9v-3H6v-3H2zM15 7h3v3h2v4h-2v3h-3v-3h2v-4h-2z",
  mute: "M2 9h4V6h3V3h3v18H9v-3H6v-3H2zM15 7h3v3h3v3h-3v3h-3v-3h3v-3h-3z",
  settings: "M9 2h6v3h3v3h3v7h-3v3h-3v3H9v-3H6v-3H3V8h3V5h3zM9 9v6h6V9z",
  close:
    "M5 3h3v3h3v3h2V6h3V3h3v5h-3v3h-3v2h3v3h3v5h-3v-3h-3v-3h-2v3H8v3H5v-5h3v-3h3v-2H8V8H5z",
  pin: "M7 2h10v3h-2v5h3v5h-5v7h-2v-7H6v-5h3V5H7z",
  device: "M3 3h18v13h-7v3h4v3H6v-3h4v-3H3zM6 6v7h12V6z",
  library: "M3 3h4v18H3zM9 3h4v18H9zM15 4h4v3h2v14h-4V10h-2z",
  back: "M11 3h4v3h-3v3H9v2h13v3H9v2h3v3h3v3h-4v-3H8v-3H5v-2H2v-3h3V9h3V6h3z",
  refresh:
    "M6 3h12v3h3v5h-7V8h3V6H7v3H4V6h2zM3 13h7v3H7v2h10v-3h3v3h-2v3H6v-3H3z",
  spotify: "M4 2h16v2h2v16h-2v2H4v-2H2V4h2z",
  minus: "M5 11h14v3H5z",
  queue:
    "M3 4h13v3H3zM3 10h13v3H3zM3 16h8v3H3zM17 13h3v3h3v3h-3v3h-3v-3h-3v-3h3z",
  size: "M3 2h7v3H6v5H3zM14 2h7v8h-3V5h-4zM3 14h3v5h4v3H3zM18 14h3v8h-7v-3h4z",
  palette:
    "M6 2h12v3h3v12h-3v4h-5v-5H9v6H5v-3H2V6h4zM6 6v3h3V6zM13 5v3h3V5zM16 11v3h3v-3zM5 13v3h3v-3z",
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      shapeRendering="crispEdges"
      {...props}
    >
      <path fillRule="evenodd" d={paths[name] || paths.heart} />
      {name === "spotify" && (
        <path
          d="M6 8Q12 5 19 9M6 12Q12 9 18 13M7 16Q12 13 17 17"
          stroke="var(--surface)"
          strokeWidth="2"
          fill="none"
        />
      )}
    </svg>
  );
}
export function IconButton({
  name,
  label,
  active = false,
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-icon={name}
      {...(props.onClick &&
      ["pin", "shuffle", "heart", "repeat", "volume", "mute"].includes(name)
        ? { "aria-pressed": active }
        : {})}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      {...props}
    >
      <Icon name={name} />
    </button>
  );
}
