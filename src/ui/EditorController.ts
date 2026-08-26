import { highlightMarkdown } from './highlight.ts';

const DEBOUNCE_MS = 380;
const MAX_FILE_BYTES = 512 * 1024;
const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt'];

export interface EditorCallbacks {
  onChange(source: string): void;
  onFocusChange(focused: boolean): void;
  onNotice(message: string, kind: 'info' | 'warn'): void;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`[dungeon.md] missing #${id}`);
  return element as T;
}

/**
 * Owns the Markdown textarea: debounced live rebuilds, syntax highlighting,
 * and local `.md` loading (file picker + drag and drop). Nothing is uploaded.
 */
export class EditorController {
  private readonly textarea = requireElement<HTMLTextAreaElement>('markdown-input');
  private readonly highlight = requireElement<HTMLPreElement>('editor-highlight');
  private readonly wrap = requireElement<HTMLDivElement>('editor-wrap');
  private readonly fileInput = requireElement<HTMLInputElement>('file-input');
  private timer: number | undefined;
  private dragDepth = 0;

  constructor(private readonly callbacks: EditorCallbacks) {
    this.textarea.addEventListener('input', () => {
      this.renderHighlight();
      this.scheduleChange();
    });
    this.textarea.addEventListener('scroll', () => this.syncScroll());
    this.textarea.addEventListener('focus', () => this.callbacks.onFocusChange(true));
    this.textarea.addEventListener('blur', () => this.callbacks.onFocusChange(false));
    this.textarea.addEventListener('keydown', (event) => this.handleKeydown(event));

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) void this.readFile(file);
      this.fileInput.value = '';
    });

    this.wrap.addEventListener('dragenter', (event) => this.onDragEnter(event));
    this.wrap.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    this.wrap.addEventListener('dragleave', () => this.onDragLeave());
    this.wrap.addEventListener('drop', (event) => this.onDrop(event));
  }

  get value(): string {
    return this.textarea.value;
  }

  /** Replace the document and rebuild immediately (no debounce). */
  setValue(source: string, options: { immediate?: boolean } = {}): void {
    this.textarea.value = source;
    this.renderHighlight();
    this.textarea.scrollTop = 0;
    this.syncScroll();
    if (options.immediate === false) return;
    window.clearTimeout(this.timer);
    this.callbacks.onChange(source);
  }

  focusEditor(): void {
    this.textarea.focus();
  }

  openFilePicker(): void {
    this.fileInput.click();
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Tab inserts two spaces instead of leaving the editor.
    if (event.key !== 'Tab' || event.shiftKey) return;
    event.preventDefault();
    const { selectionStart, selectionEnd, value } = this.textarea;
    this.textarea.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    this.textarea.selectionStart = this.textarea.selectionEnd = selectionStart + 2;
    this.renderHighlight();
    this.scheduleChange();
  }

  private scheduleChange(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.callbacks.onChange(this.textarea.value);
    }, DEBOUNCE_MS);
  }

  private renderHighlight(): void {
    this.highlight.innerHTML = highlightMarkdown(this.textarea.value);
    this.syncScroll();
  }

  private syncScroll(): void {
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
  }

  private onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth++;
    this.wrap.classList.add('dragging');
  }

  private onDragLeave(): void {
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.wrap.classList.remove('dragging');
  }

  private onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.wrap.classList.remove('dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.readFile(file);
  }

  private async readFile(file: File): Promise<void> {
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      this.callbacks.onNotice('That file is not Markdown (.md, .markdown, .txt).', 'warn');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.callbacks.onNotice('That file is larger than 512 KB.', 'warn');
      return;
    }
    try {
      const text = await file.text();
      this.setValue(text);
      this.callbacks.onNotice(`Loaded ${file.name}`, 'info');
    } catch {
      this.callbacks.onNotice(`Could not read ${file.name}.`, 'warn');
    }
  }
}
