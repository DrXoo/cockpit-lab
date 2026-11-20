// Hands the user a file the page made, as the browser downloads one.

/** Downloads `text` as a file named `filename`, of the given media type. */
export function downloadText(filename: string, text: string, mediaType: string) {
  const blob = new Blob([text], { type: mediaType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
