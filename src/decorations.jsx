import React from "react";
export function Bow() {
  return (
    <svg
      className="bow"
      viewBox="0 0 64 64"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {/* Mirrored loops and separate, notched tails keep the ribbon readable. */}
      <g fill="var(--blue)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="miter">
        <path d="M27 29H37L29 43V55H21V51H15V43H19V35Z" />
        <path d="M37 29H27L35 43V55H43V51H49V43H45V35Z" />
        <path d="M27 22L17 12H7V16H3V30H7V36H17L27 29Z" />
        <path d="M37 22L47 12H57V16H61V30H57V36H47L37 29Z" />
      </g>
      <g fill="var(--border)">
        <path d="M9 28H17L26 25V29L17 33H9Z M55 28H47L38 25V29L47 33H55Z" />
        <path d="M25 35H29L23 45V51H19V43Z M39 35H35L41 45V51H45V43Z" />
      </g>
      <g fill="#f7fdff">
        <path d="M7 16H15V19H19V22H13V20H7Z M57 16H49V19H45V22H51V20H57Z" />
        <path d="M25 36H28L22 45H19Z M39 36H36L42 45H45Z" />
      </g>
      <path fill="var(--border)" stroke="var(--ink)" strokeWidth="2" d="M27 21H37V31H27Z" />
      <path fill="#f7fdff" d="M29 23H35V26H29Z" />
    </svg>
  );
}
export function Moon({ small = false }) {
  return (
    <div className={"moon-art " + (small ? "small" : "")} aria-hidden="true">
      <span className="moon-crescent" />
      <span className="moon-star one">✦</span>
      <span className="moon-star two">+</span>
      <span className="moon-star three">✧</span>
      <i className="cloud c1" />
      <i className="cloud c2" />
      <div className="skyline" />
    </div>
  );
}
