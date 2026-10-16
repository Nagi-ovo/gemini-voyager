export function canvasFixture(owner = 'inline-preview', id = 'canvas-menu'): string {
  return `<${owner}>
    <div class="inline-preview-container"><div class="title-container">
      <gem-button class="gem-button" fonticonname="file_export" aria-haspopup="true" aria-expanded="true" aria-controls="${id}">
        <button aria-label="Export"><mat-icon fonticon="file_export"></mat-icon></button>
      </gem-button>
    </div>
    <immersive-editor><div class="ProseMirror"><h1>Document</h1><p>Hello <strong>world</strong></p></div></immersive-editor>
    </div>
  </${owner}>`;
}

export function fillMenu(panel: HTMLElement): void {
  panel.innerHTML = `
    <gem-menu-item role="menuitem" value="download_md" leadingicon="description" arialabel="Download .md" jslog="download" tabindex="0" data-active="true" class="active">
      <gem-menu-item-content class="active">
        <div class="leading-container"><gem-icon><mat-icon class="mat-icon google-symbols" fonticon="description" data-mat-icon-name="description"></mat-icon></gem-icon></div>
        <div class="label-container"><span class="label">.md</span></div>
        <div class="trailing-container"></div>
      </gem-menu-item-content>
    </gem-menu-item>
    <gem-menu-item role="menuitem" value="export_md_drive" leadingicon="drive" arialabel="Export to Drive" tabindex="-1"><gem-menu-item-content><div class="label-container"><span class="label">Drive</span></div></gem-menu-item-content></gem-menu-item>`;
}

export function setup(ready = true, owner = 'inline-preview'): HTMLElement {
  document.body.innerHTML = `${canvasFixture(owner)}
    <div class="cdk-overlay-popover"><div class="cdk-overlay-pane"><div class="container">
      <gem-menu id="canvas-menu" role="menu" tabindex="-1" data-visible="true"></gem-menu>
    </div></div></div>`;
  const panel = document.getElementById('canvas-menu')!;
  if (ready) fillMenu(panel);
  return panel;
}
