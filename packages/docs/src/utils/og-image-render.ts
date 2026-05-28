import dynamicOgTemplate from '~/media/og/dynamic-og.svg?raw';

export const renderDynamicOgImage = (title: string, subtitle: string) => {
  const titleLines = wrapText(title, 18, 3);
  const titleFontSize = titleLines.length > 2 ? 78 : 88;
  const titleLineHeight = titleFontSize * 1.08;
  const titleY = titleLines.length > 2 ? 238 : 260;
  const subtitleText = truncateText(subtitle, 34);

  return dynamicOgTemplate.replace(
    '</svg>',
    `<g font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
  <text x="600" y="${titleY}" fill="#FFFFFF" font-size="${titleFontSize}" font-weight="800" letter-spacing="-2">
${titleLines
  .map(
    (line, index) =>
      `    <tspan x="600" dy="${index === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`
  )
  .join('\n')}
  </text>
  <text x="600" y="${titleY + titleLines.length * titleLineHeight + 52}" fill="#18B6F6" font-size="40" font-weight="700" letter-spacing="0">
    ${escapeXml(subtitleText)}
  </text>
</g>
</svg>`
  );
};

const wrapText = (value: string, maxLineLength: number, maxLines: number) => {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxLineLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmedLines = lines.slice(0, maxLines);
  trimmedLines[maxLines - 1] = truncateText(trimmedLines[maxLines - 1], maxLineLength - 3);
  return trimmedLines;
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trim()}...`;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
