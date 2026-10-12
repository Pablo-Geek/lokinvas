/** Use the same browser font and wrapping rules as the text shown on the canvas. */
export function textHeight(text: string, fontSize: number, width: number): number {
  const element = document.createElement('div');
  element.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;left:-30000px;top:0;width:${width}px;font-family:"Segoe UI",sans-serif;font-size:${fontSize}px;line-height:1.25;white-space:pre-wrap;overflow-wrap:anywhere;`;
  element.textContent = text || ' ';
  document.body.appendChild(element);
  const height = Math.max(8, Math.ceil(element.getBoundingClientRect().height));
  element.remove();
  return Math.min(20000, height);
}
