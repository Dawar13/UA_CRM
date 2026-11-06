/**
 * The UA brand mark: the founders' monogram, a white U and striped A on grainy UA blue
 * (supplied 6 Nov 2026 as Favcon_Utopian.png, D-044). 28px with 7px corners in the header;
 * other sizes keep the proportions.
 *
 * The files beside this one are cropped around the monogram from the 2000px original:
 * ua-mark.png (112px, the 28px mark at 4x) and ua-favicon.png (64px). To change the logo,
 * replace them; nothing else needs to change.
 *
 * Kept free of asset imports so vite.config.ts can read it in Node.
 */
export const BRAND_MARK_SIZE = 28
export const BRAND_MARK_RADIUS = 7

/** The favicon, relative to the repository root (vite.config.ts inlines it). */
export const FAVICON_PATH = 'src/assets/brand/ua-favicon.png'
