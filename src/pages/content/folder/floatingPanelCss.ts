import baseCss from './floatingPanel.css?raw';
import polishCss from './floatingPanelPolish.css?raw';
import polishSchemesCss from './floatingPanelPolishSchemes.css?raw';
import siteOptionsCss from './floatingPanelSiteOptions.css?raw';

/** The folder tree's shadow-root stylesheet, in cascade order: each part refines the ones before it. */
export const FLOATING_PANEL_CSS = [baseCss, polishCss, polishSchemesCss, siteOptionsCss].join('\n');
