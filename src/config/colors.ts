/**
 * UI color palette — sidebar group colors and utility colors.
 * Edit these to change the sidebar color scheme without touching components.
 */

/** Colors for sidebar section group headers and section titles */
export const GROUP_COLORS = {
  box:       '#7BA3CF',  // Soft blue   — Box & Lid
  standoffs: '#C9A84C',  // Warm amber  — Standoffs
  cutouts:   '#7BAF7B',  // Sage green  — Cutouts
  text:      '#A78BBA',  // Soft purple — Text Labels
  settings:  '#9B9B9B',  // Neutral gray — Settings
} as const;

/** Muted color for utility UI elements (dropdowns, toolbar buttons) */
export const UI_MUTED = '#9B9B9B';
