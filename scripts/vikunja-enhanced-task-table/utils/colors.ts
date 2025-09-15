/**
 * Checks if a hex color string corresponds to a light color,
 * to determine proper contrasting text color.
 * Uses an approximation of WCAG APCA luminance.
 */
export function isHexColorLight(color: string | undefined): boolean {
    if (!color || color === '#') {
        return true;
    }

    if (!color.startsWith('#')) {
        color = '#' + color;
    }

    const rgb = parseInt(color.slice(1, 7), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    const luminance =
        Math.pow(r / 255, 2.2) * 0.2126 + Math.pow(g / 255, 2.2) * 0.7152 + Math.pow(b / 255, 2.2) * 0.0722;

    return Math.pow(luminance, 0.678) >= 0.5;
}
