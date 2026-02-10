import { renderMermaid, renderMermaidAscii, THEMES } from '../lib/beautiful-mermaid/index.ts';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { samples } from './samples.js';

// --- State ---
let currentMode = 'svg'; // 'svg' | 'ascii'
let currentThemeName = '';
let isDark = false;
let zoomLevel = 1;
let editor;
let renderTimeout;
let lastSvgString = '';
let lastAsciiString = '';

// --- DOM Elements ---
const editorContainer = document.getElementById('editor-container');
const previewSvg = document.getElementById('preview-svg');
const previewAscii = document.getElementById('preview-ascii');
const previewError = document.getElementById('preview-error');
const previewLoading = document.getElementById('preview-loading');
const btnSvg = document.getElementById('btn-svg');
const btnAscii = document.getElementById('btn-ascii');
const btnTheme = document.getElementById('btn-theme');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const themeSelect = document.getElementById('theme-select');
const themeName = document.getElementById('theme-name');
const diagramTypeBadge = document.getElementById('diagram-type-badge');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');
const toastEl = document.getElementById('toast');
const iconSun = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');

// --- Initialize Theme ---
function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  iconSun.style.display = isDark ? 'none' : 'block';
  iconMoon.style.display = isDark ? 'block' : 'none';
  // Recreate editor with appropriate theme
  initEditor(editor ? getCode() : samples.state);
}

// --- Theme Selector ---
function populateThemeSelect() {
  const names = Object.keys(THEMES);
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.replace(/-/g, ' ');
    themeSelect.appendChild(opt);
  });
}

// --- CodeMirror Editor ---
function initEditor(initialCode) {
  const existingCode = editor ? getCode() : initialCode;
  if (editor) editor.destroy();

  const extensions = [
    basicSetup,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        scheduleRender();
      }
    }),
    EditorView.lineWrapping,
  ];

  if (isDark) {
    extensions.push(oneDark);
  }

  editor = new EditorView({
    state: EditorState.create({
      doc: existingCode,
      extensions,
    }),
    parent: editorContainer,
  });
}

function getCode() {
  return editor.state.doc.toString();
}

function setCode(code) {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: code },
  });
}

// --- Rendering ---
function scheduleRender() {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => render(), 300);
}

async function render() {
  const code = getCode().trim();
  if (!code) {
    previewSvg.innerHTML = '';
    previewAscii.textContent = '';
    previewError.style.display = 'none';
    diagramTypeBadge.textContent = '';
    return;
  }

  previewLoading.style.display = 'flex';
  previewError.style.display = 'none';

  // Detect diagram type from first line
  const firstLine = code.split('\n')[0].trim().toLowerCase();
  let diagramType = 'flowchart';
  if (firstLine.startsWith('sequencediagram')) diagramType = 'sequence';
  else if (firstLine.startsWith('statediagram')) diagramType = 'state';
  else if (firstLine.startsWith('classdiagram')) diagramType = 'class';
  else if (firstLine.startsWith('erdiagram')) diagramType = 'er';
  else if (firstLine.startsWith('graph') || firstLine.startsWith('flowchart')) diagramType = 'flowchart';
  diagramTypeBadge.textContent = diagramType;

  try {
    if (currentMode === 'svg') {
      const themeColors = currentThemeName ? THEMES[currentThemeName] : (isDark ? THEMES['tokyo-night'] : undefined);
      const svg = await renderMermaid(code, themeColors);
      lastSvgString = svg;
      previewSvg.innerHTML = svg;
      previewSvg.style.display = 'flex';
      previewAscii.style.display = 'none';
      applyZoom();
      themeName.textContent = currentThemeName ? currentThemeName.replace(/-/g, ' ') : (isDark ? 'tokyo night' : 'default');
    } else {
      const ascii = renderMermaidAscii(code);
      lastAsciiString = ascii;
      previewAscii.textContent = ascii;
      previewAscii.style.display = 'block';
      previewSvg.style.display = 'none';
      themeName.textContent = 'ASCII';
    }
    previewError.style.display = 'none';
  } catch (err) {
    previewError.textContent = err.message || String(err);
    previewError.style.display = 'block';
  } finally {
    previewLoading.style.display = 'none';
  }
}

// --- Zoom ---
function applyZoom() {
  const target = currentMode === 'svg' ? previewSvg : previewAscii;
  target.style.transform = `scale(${zoomLevel})`;
}

btnZoomIn.addEventListener('click', () => {
  zoomLevel = Math.min(zoomLevel + 0.1, 3);
  applyZoom();
});

btnZoomOut.addEventListener('click', () => {
  zoomLevel = Math.max(zoomLevel - 0.1, 0.3);
  applyZoom();
});

btnZoomReset.addEventListener('click', () => {
  zoomLevel = 1;
  applyZoom();
});

// --- Mode Toggle (SVG / ASCII) ---
btnSvg.addEventListener('click', () => {
  if (currentMode === 'svg') return;
  currentMode = 'svg';
  btnSvg.classList.add('active');
  btnAscii.classList.remove('active');
  zoomLevel = 1;
  render();
});

btnAscii.addEventListener('click', () => {
  if (currentMode === 'ascii') return;
  currentMode = 'ascii';
  btnAscii.classList.add('active');
  btnSvg.classList.remove('active');
  zoomLevel = 1;
  render();
});

// --- Dark/Light Toggle ---
btnTheme.addEventListener('click', () => {
  isDark = !isDark;
  applyTheme();
  render();
});

// --- Theme Select ---
themeSelect.addEventListener('change', (e) => {
  currentThemeName = e.target.value;
  render();
});

// --- Sample Diagrams ---
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sampleName = btn.dataset.sample;
    if (samples[sampleName]) {
      setCode(samples[sampleName]);
    }
  });
});

// --- Toast ---
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1500);
}

// --- Copy ---
btnCopy.addEventListener('click', async () => {
  try {
    if (currentMode === 'svg') {
      // Copy SVG as PNG image to clipboard
      const svgEl = previewSvg.querySelector('svg');
      if (!svgEl) return;
      const blob = await svgToPngBlob(svgEl);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('PNG copied to clipboard');
    } else {
      // Copy ASCII as text
      await navigator.clipboard.writeText(lastAsciiString);
      showToast('ASCII copied to clipboard');
    }
  } catch (err) {
    showToast('Copy failed: ' + err.message);
  }
});

// --- Download ---
btnDownload.addEventListener('click', async () => {
  try {
    if (currentMode === 'svg') {
      // Download SVG as PNG
      const svgEl = previewSvg.querySelector('svg');
      if (!svgEl) return;
      const blob = await svgToPngBlob(svgEl);
      downloadBlob(blob, 'diagram.png');
      showToast('PNG downloaded');
    } else {
      // Download ASCII as text
      const blob = new Blob([lastAsciiString], { type: 'text/plain' });
      downloadBlob(blob, 'diagram.txt');
      showToast('Text file downloaded');
    }
  } catch (err) {
    showToast('Download failed: ' + err.message);
  }
});

/** Convert an SVG element to a PNG Blob via canvas */
function svgToPngBlob(svgEl) {
  return new Promise((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    // Scale up 2x for crisp output
    const scale = 2;
    const w = svgEl.viewBox?.baseVal?.width || svgEl.width?.baseVal?.value || 800;
    const h = svgEl.viewBox?.baseVal?.height || svgEl.height?.baseVal?.value || 600;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
    img.src = url;
  });
}

/** Trigger a file download from a Blob */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Resizable Panels ---
function initResizer() {
  const gutter = document.getElementById('gutter');
  const panelLeft = document.getElementById('panel-left');
  let isResizing = false;

  gutter.addEventListener('mousedown', (e) => {
    isResizing = true;
    gutter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerRect = document.querySelector('.main-content').getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    const minWidth = 280;
    const maxWidth = containerRect.width - 300;
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    panelLeft.style.width = clampedWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      gutter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// --- Initialize ---
populateThemeSelect();
applyTheme();
initResizer();
render();
