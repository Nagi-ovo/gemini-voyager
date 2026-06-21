/**
 * Unit tests for Canvas Document Extractor
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assistantHasCanvasDoc,
  extractAllCanvasDocs,
  isAnyCanvasOpen,
} from '../canvasDocExtractor';

describe('canvasDocExtractor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // ── isAnyCanvasOpen ────────────────────────────────────────────

  describe('isAnyCanvasOpen', () => {
    it('returns false when no canvas panel is present', () => {
      expect(isAnyCanvasOpen()).toBe(false);
    });

    it('returns true when immersive-editor is present (Document Canvas)', () => {
      document.body.innerHTML = '<immersive-editor></immersive-editor>';
      expect(isAnyCanvasOpen()).toBe(true);
    });

    it('returns true when code-immersive-panel is present (Code Canvas)', () => {
      document.body.innerHTML = '<code-immersive-panel></code-immersive-panel>';
      expect(isAnyCanvasOpen()).toBe(true);
    });
  });

  // ── assistantHasCanvasDoc ──────────────────────────────────────

  describe('assistantHasCanvasDoc', () => {
    it('detects immersive-entry-chip custom element', () => {
      const div = document.createElement('div');
      div.innerHTML = '<immersive-entry-chip></immersive-entry-chip>';
      expect(assistantHasCanvasDoc(div)).toBe(true);
    });

    it('detects canvas-create-button custom element', () => {
      const div = document.createElement('div');
      div.innerHTML = '<canvas-create-button></canvas-create-button>';
      expect(assistantHasCanvasDoc(div)).toBe(true);
    });

    it('detects class containing "canvas"', () => {
      const div = document.createElement('div');
      div.innerHTML = '<div class="canvas-preview-card"></div>';
      expect(assistantHasCanvasDoc(div)).toBe(true);
    });

    it('detects nested canvas indicators', () => {
      const div = document.createElement('div');
      div.innerHTML = '<div><section><immersive-entry-chip></immersive-entry-chip></section></div>';
      expect(assistantHasCanvasDoc(div)).toBe(true);
    });

    it('returns false for normal content', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>Normal text</p><code>code</code>';
      expect(assistantHasCanvasDoc(div)).toBe(false);
    });

    it('returns false for empty element', () => {
      const div = document.createElement('div');
      expect(assistantHasCanvasDoc(div)).toBe(false);
    });
  });

  // ── Document Canvas (ProseMirror) ──────────────────────────────

  describe('extractAllCanvasDocs (Document Canvas)', () => {
    it('extracts content from immersive-editor with ProseMirror', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <div class="immersive-editor-header"><h1>Test Doc</h1></div>
          <div class="ProseMirror">
            <h1>Hello World</h1>
            <p>Some content</p>
          </div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Test Doc');
      expect(docs[0].content).toContain('# Hello World');
      expect(docs[0].content).toContain('Some content');
    });

    it('finds title from h1 inside immersive-editor', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <h1>My Canvas Title</h1>
          <div class="ProseMirror"><p>Content here</p></div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('My Canvas Title');
    });

    it('falls back to "Canvas Document" when no title found', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <div class="ProseMirror"><p>Content here</p></div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Canvas Document');
    });

    it('returns empty array when no editors present', () => {
      document.body.innerHTML = '<div>no editors here</div>';
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(0);
    });

    it('returns empty array when ProseMirror has no content', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <div class="ProseMirror"></div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(0);
    });

    it('returns empty array when ProseMirror is missing', () => {
      document.body.innerHTML = '<immersive-editor></immersive-editor>';
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(0);
    });

    it('extracts multiple Document Canvas docs', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <h1>First Doc</h1>
          <div class="ProseMirror"><p>First content</p></div>
        </immersive-editor>
        <immersive-editor>
          <h1>Second Doc</h1>
          <div class="ProseMirror"><p>Second content</p></div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe('First Doc');
      expect(docs[1].title).toBe('Second Doc');
    });

    it('skips editors without ProseMirror content', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <div class="ProseMirror"><p>Content</p></div>
        </immersive-editor>
        <immersive-editor>
          <div class="ProseMirror"></div>
        </immersive-editor>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
    });
  });

  // ── Code Canvas (Monaco editor) ────────────────────────────────

  describe('extractAllCanvasDocs (Code Canvas)', () => {
    it('extracts code content from view-lines / view-line', () => {
      document.body.innerHTML = `
        <code-immersive-panel>
          <toolbar>
            <h2 class="title-text">Quick Sort</h2>
          </toolbar>
          <xap-code-editor>
            <div class="monaco-editor">
              <div class="view-lines">
                <div class="view-line">def quick_sort(arr):</div>
                <div class="view-line">    if len(arr) <= 1:</div>
                <div class="view-line">        return arr</div>
              </div>
            </div>
          </xap-code-editor>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Quick Sort');
      expect(docs[0].content).toContain('def quick_sort(arr):');
      expect(docs[0].content).toContain('    if len(arr) <= 1:');
      expect(docs[0].content).toContain('        return arr');
      // Verify newlines are preserved
      expect(docs[0].content.split('\n').length).toBeGreaterThanOrEqual(3);
    });

    it('extracts code from immersive-panel with embedded code-immersive-panel (App Canvas)', () => {
      document.body.innerHTML = `
        <immersive-panel>
          <code-immersive-panel>
            <toolbar>
              <h2 class="title-text">Pomodoro App</h2>
            </toolbar>
            <xap-code-editor>
              <div class="monaco-editor">
                <div class="view-lines">
                  <div class="view-line">&lt;!DOCTYPE html&gt;</div>
                  <div class="view-line">&lt;html&gt;</div>
                  <div class="view-line">&lt;head&gt;&lt;title&gt;Pomodoro&lt;/title&gt;&lt;/head&gt;</div>
                </div>
              </div>
            </xap-code-editor>
          </code-immersive-panel>
        </immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Pomodoro App');
      expect(docs[0].content).toContain('<!DOCTYPE html>');
      expect(docs[0].content).toContain('<html>');
    });

    it('extracts code when Document and Code Canvas are both open', () => {
      document.body.innerHTML = `
        <immersive-editor>
          <h1>Essay</h1>
          <div class="ProseMirror"><p>Some text</p></div>
        </immersive-editor>
        <code-immersive-panel>
          <toolbar>
            <h2 class="title-text">Script</h2>
          </toolbar>
          <xap-code-editor>
            <div class="monaco-editor">
              <div class="view-lines">
                <div class="view-line">print("hello")</div>
              </div>
            </div>
          </xap-code-editor>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe('Essay');
      expect(docs[1].title).toBe('Script');
    });

    it('returns empty array when view-lines is empty', () => {
      document.body.innerHTML = `
        <code-immersive-panel>
          <xap-code-editor>
            <div class="monaco-editor">
              <div class="view-lines">
              </div>
            </div>
          </xap-code-editor>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(0);
    });

    it('returns empty array when code-immersive-panel has no xap-code-editor', () => {
      document.body.innerHTML = `
        <code-immersive-panel>
          <toolbar><h2 class="title-text">Empty</h2></toolbar>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(0);
    });

    it('falls back to "Code Canvas" when title is missing', () => {
      document.body.innerHTML = `
        <code-immersive-panel>
          <toolbar></toolbar>
          <xap-code-editor>
            <div class="monaco-editor">
              <div class="view-lines">
                <div class="view-line">const x = 1;</div>
              </div>
            </div>
          </xap-code-editor>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Code Canvas');
    });

    it('detects language from data-mode-id and annotates content', () => {
      document.body.innerHTML = `
        <code-immersive-panel>
          <xap-code-editor>
            <div class="xap-monaco-container" data-mode-id="python">
              <div class="monaco-editor">
                <div class="view-lines">
                  <div class="view-line">import os</div>
                </div>
              </div>
            </div>
          </xap-code-editor>
        </code-immersive-panel>
      `;
      const docs = extractAllCanvasDocs();
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toContain('// PYTHON');
      expect(docs[0].content).toContain('import os');
    });
  });
});
