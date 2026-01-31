/**
 * Plugin Utilities
 */

/**
 * Open URL in browser
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic import for ESM compatibility
    const open = await import('open');
    await open.default(url);
  } catch (error) {
    // Fallback to console instruction
    console.log(`\nPlease open this URL in your browser:\n${url}\n`);
  }
}
