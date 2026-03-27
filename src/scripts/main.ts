import {
  detectSource,
  raidbotsReportId,
  qeReportId,
  extract,
  extractQE,
  type ExtractOutput,
  type UpgradeResult,
} from '../lib/extract';

declare const WH: { tooltips?: { refreshLinks: () => void } };

const EXTRACT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

const DIFF_LABELS: Record<number, string> = { 0: 'LFR', 2: 'Normal', 4: 'Heroic', 6: 'Mythic' };

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class SimExtractor extends HTMLElement {
  private reportUrl!: HTMLInputElement;
  private inputJson!: HTMLTextAreaElement;
  private extractBtn!: HTMLButtonElement;
  private outputPanel!: HTMLDivElement;
  private outputJson!: HTMLTextAreaElement;
  private errorBox!: HTMLDivElement;
  private statsRow!: HTMLDivElement;
  private previewBody!: HTMLTableSectionElement;
  private copyBtn!: HTMLButtonElement;
  private manualFallback!: HTMLDetailsElement;

  connectedCallback() {
    this.reportUrl      = this.querySelector<HTMLInputElement>('[data-report-url]')!;
    this.inputJson      = this.querySelector<HTMLTextAreaElement>('[data-input-json]')!;
    this.extractBtn     = this.querySelector<HTMLButtonElement>('[data-extract-btn]')!;
    this.outputPanel    = this.querySelector<HTMLDivElement>('[data-output-panel]')!;
    this.outputJson     = this.querySelector<HTMLTextAreaElement>('[data-output-json]')!;
    this.errorBox       = this.querySelector<HTMLDivElement>('[data-error-box]')!;
    this.statsRow       = this.querySelector<HTMLDivElement>('[data-stats-row]')!;
    this.previewBody    = this.querySelector<HTMLTableSectionElement>('[data-preview-body]')!;
    this.copyBtn        = this.querySelector<HTMLButtonElement>('[data-copy-btn]')!;
    this.manualFallback = this.querySelector<HTMLDetailsElement>('[data-manual-fallback]')!;

    this.extractBtn.addEventListener('click', () => this.handleExtract());
    this.reportUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.extractBtn.click(); });
    this.copyBtn.addEventListener('click', () => this.handleCopy());
  }

  private showError(msg: string): void {
    this.errorBox.textContent = msg;
    this.errorBox.style.display = 'block';
  }

  private setExtracting(on: boolean): void {
    this.extractBtn.disabled = on;
    this.extractBtn.innerHTML = on
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Fetching…'
      : EXTRACT_ICON + ' Extract';
  }

  private renderOutput({ compact, results, baseline, spec, playerName }: ExtractOutput): void {
    this.outputJson.value = JSON.stringify(compact);
    this.outputPanel.classList.remove('hidden');

    this.statsRow.innerHTML = `
      <div class="stat">
        <div class="stat-label">Player</div>
        <div class="stat-value" title="${esc(playerName)}">${esc(playerName)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Spec</div>
        <div class="stat-value" style="font-size:12px" title="${esc(spec)}">${esc(spec)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Baseline DPS</div>
        <div class="stat-value">${baseline != null ? Math.round(baseline).toLocaleString() : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Upgrades Found</div>
        <div class="stat-value green">${results.length}</div>
      </div>
    `;

    this.previewBody.innerHTML = results.slice(0, 20).map((r: UpgradeResult, i: number) => {
      const diff = r.dropLoc === 'Dungeon'
        ? `M+${r.dropDifficulty}`
        : (DIFF_LABELS[r.dropDifficulty ?? -1] || `Diff ${r.dropDifficulty}`);
      const sourceLabel = r.sourceName ? `${esc(r.sourceName)} ${diff}` : `${esc(r.dropLoc)} ${diff}`;
      const ilvlParam = r.ilvl ? `&ilvl=${r.ilvl}` : '';
      return `
        <tr>
          <td class="td-rank">${i + 1}</td>
          <td class="td-item"><a href="https://www.wowhead.com/item=${r.itemID}" data-wowhead="item=${r.itemID}${ilvlParam}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${r.itemID}</a></td>
          <td>${r.slot ? `<span class="slot-chip">${esc(r.slot)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>${r.ilvl || '—'}</td>
          <td class="td-source">${sourceLabel}</td>
          <td class="td-upgrade">+${r.percDiff.toFixed(3)}%</td>
        </tr>`;
    }).join('');

    this.outputPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof WH !== 'undefined' && WH.tooltips) WH.tooltips.refreshLinks();
  }

  private async handleExtract(): Promise<void> {
    this.errorBox.style.display = 'none';

    const url  = this.reportUrl.value.trim();
    const text = this.inputJson.value.trim();

    if (url) {
      const source = detectSource(url);
      if (!source) {
        this.showError('URL not recognised. Paste a Raidbots or Questionably Epic report URL.');
        return;
      }

      this.setExtracting(true);
      try {
        let json: string;
        let output: ExtractOutput;

        if (source === 'raidbots') {
          const id = raidbotsReportId(url);
          if (!id) throw new Error('Could not parse the report ID from that Raidbots URL.');
          const response = await fetch(`https://www.raidbots.com/reports/${id}/data.json`);
          if (!response.ok) throw new Error(`Raidbots returned ${response.status}. The report may be private or expired.`);
          json   = await response.text();
          output = extract(json);
        } else {
          const id = qeReportId(url);
          if (!id) throw new Error('Could not parse the report ID from that Questionably Epic URL.');
          const response = await fetch(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${id}`);
          if (!response.ok) throw new Error(`Questionably Epic returned ${response.status}. The report may not exist.`);
          json   = await response.text();
          output = extractQE(json);
        }

        this.renderOutput(output);
      } catch (e) {
        if (e instanceof TypeError) {
          this.showError('Could not fetch the report directly (network or CORS error). Use the manual paste option below instead.');
          this.manualFallback.open = true;
        } else {
          this.showError((e as Error).message);
        }
      } finally {
        this.setExtracting(false);
      }
      return;
    }

    if (!text) {
      this.showError('Paste a Raidbots report URL above, or expand "Or paste JSON manually" below.');
      return;
    }

    this.setExtracting(true);
    // Defer to let the browser repaint before the heavy JSON.parse
    setTimeout(() => {
      try {
        let parsed = JSON.parse(text);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed); // QE double-encoding
        const output = parsed.sim ? extract(text) : extractQE(text);
        this.renderOutput(output);
      } catch (e) {
        this.showError((e as Error).message);
      } finally {
        this.setExtracting(false);
      }
    }, 16);
  }

  private handleCopy(): void {
    navigator.clipboard.writeText(this.outputJson.value).then(() => {
      this.copyBtn.textContent = '✓ Copied!';
      this.copyBtn.classList.add('done');
      setTimeout(() => {
        this.copyBtn.textContent = 'Copy to Clipboard';
        this.copyBtn.classList.remove('done');
      }, 2500);
    });
  }
}

customElements.define('sim-extractor', SimExtractor);
