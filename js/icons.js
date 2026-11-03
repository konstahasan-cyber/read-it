// iOS-style line icons (drawn after SF Symbols: 24px grid, rounded 2px strokes).
// They take the colour of the surrounding text.

const wrap = (body, { fill = false } = {}) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icon = {
  speaker: wrap('<path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M17.8 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mic: wrap('<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  flame: wrap('<path d="M12 21.5c-4 0-6.8-2.7-6.8-6.4 0-3 1.8-5 3.6-6.8.4 1.6 1.3 2.6 2.4 3.1C11 8 12.6 5 15 2.5c.4 3 4 5.4 4 10.6 0 4.6-3 8.4-7 8.4z" stroke="none"/>', { fill: true }),
  star: wrap('<path d="M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z" stroke="none"/>', { fill: true }),
  book: wrap('<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>'),
  bolt: wrap('<path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" stroke-width="1.8"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="M7.5 12.3l3 3 6-6.3" stroke="#fff"/>'),
  doc: wrap('<path d="M6 2.8h8l4.5 4.5V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20V4A1.2 1.2 0 0 1 6 2.8z"/><path d="M14 2.8v4.5h4.5M8.5 12.5h7M8.5 16.5h5"/>'),
  repeat: wrap('<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16 3l3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M8 21l-3-3 3-3"/>'),
  map: wrap('<path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  person: wrap('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>'),
  lock: wrap('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  play: wrap('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  target: wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  snow: wrap('<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2"/>'),
  medal: wrap('<path d="M8 2.5l2.5 6M16 2.5l-2.5 6"/><circle cx="12" cy="15" r="6"/><path d="M12 12.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke="none"/>'),
  sparkles: wrap('<path d="M10 3l1.6 4.6L16 9.2l-4.4 1.6L10 15.5l-1.6-4.7L4 9.2l4.4-1.6z" fill="currentColor" stroke="none"/><path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" stroke="none"/>'),
  share: wrap('<path d="M12 3v12M8 6.5L12 3l4 3.5"/><path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-2"/>'),
  chevron: wrap('<path d="M9 5l7 7-7 7"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
};
