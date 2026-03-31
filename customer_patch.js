(function () {
  if (window.__customerPatchLoaded) return;
  window.__customerPatchLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    .ev-item{align-items:flex-start !important;flex-wrap:wrap}
    .ev-info{flex:1 1 190px;min-width:0}
    .ev-title,.ev-meta{overflow-wrap:anywhere;word-break:break-word}
    .ev-amount{margin-right:auto;text-align:left;min-width:110px}
  `;
  document.head.appendChild(style);

  function fixCustomerChrome() {
    document.title = 'پەڕەی کڕیار';
    const loaderText = document.querySelector('#root > div > div:last-child');
    if (loaderText) loaderText.textContent = 'ناوەڕۆک بار دەکرێت...';
  }

  if (typeof window.showLoadingState === 'function') {
    window.showLoadingState = function showLoadingStatePatched(msg = 'ناوەڕۆک بار دەکرێت...') {
      const root = document.getElementById('root');
      if (!root) return;
      root.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px">
          <div style="width:32px;height:32px;border:2.5px solid #1e2d45;border-top-color:#4f8ef7;border-radius:50%;animation:spin .8s linear infinite"></div>
          <div style="color:#6b7fa3;font-size:12px">${escHtml(msg)}</div>
        </div>`;
    };
  }

  window.buildEvItem = function buildEvItemPatched(tx) {
    const icons = { sell_cash:'💵', sell_debt:'🧾', debt_pay:'✅' };
    const labels = { sell_cash:'فرۆشتنی نەقد', sell_debt:'فرۆشتنی قەرز', debt_pay:'پارەدانەوەی قەرز' };
    const amtCls = tx.type === 'debt_pay' ? 'tok' : tx.type === 'sell_debt' ? 'tbad' : 'tprimary';
    const meta = [tx.date || ''];
    if (tx.note) meta.push(escHtml(tx.note));
    if (tx.dueDate) meta.push('بەرواری قەرز: ' + escHtml(tx.dueDate));
    if (tx.discountAmount > 0) meta.push('داشکاندن');
    return `<div class="ev-item"><div class="ev-icon">${icons[tx.type] || '📄'}</div><div class="ev-info"><div class="ev-title">${labels[tx.type] || tx.type}${tx.prod ? ' | ' + escHtml(tx.prod) : ''}${tx.qty != null ? ' | ' + fmtN(tx.qty, 2) + ' ' + escHtml(tx.unit) : ''}</div><div class="ev-meta">${meta.join(' | ')}</div></div><div class="ev-amount ${amtCls}">${fmtC(tx.amount, tx.currency)}</div></div>`;
  };

  function sanitizeCustomerText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const fixes = [
      ['أ¢â‚¬آ¢', ' | '],
      ['â€¢', ' | '],
      ['آ·', ' | '],
      ['â€”', '-'],
      ['ظ…ط§ظ…غ•عµغ•ع©ط§ظ†ظ…', 'پەڕەی کڕیار'],
      ['ع†ط§ظˆغ•ع•غژط¨غ•...', 'ناوەڕۆک بار دەکرێت...']
    ];
    let node;
    while ((node = walker.nextNode())) {
      let next = node.nodeValue || '';
      fixes.forEach(([from, to]) => { next = next.split(from).join(to); });
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  setTimeout(() => {
    fixCustomerChrome();
    if (typeof render === 'function') render();
    fixCustomerChrome();
    sanitizeCustomerText();
  }, 0);
})();
