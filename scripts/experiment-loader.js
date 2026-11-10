const SCOPES = /^data-(experiment|audience|campaign)(?=$|[-:])/;

/**
 * Edge Delivery renders Section Metadata as data-* attributes on the section and drops the
 * table, but the plugin only reads .section-metadata tables. Rebuild them so it can see them.
 * @param {Document} doc The document object.
 */
function restoreSectionMetadata(doc) {
  doc.querySelectorAll('main > div').forEach((section) => {
    const attrs = section.getAttributeNames().filter((a) => SCOPES.test(a));
    if (!attrs.length || section.querySelector(':scope > .section-metadata')) return;
    const table = doc.createElement('div');
    table.className = 'section-metadata';
    attrs.forEach((attr) => {
      const value = section.getAttribute(attr);
      const key = doc.createElement('div');
      key.textContent = attr.slice(5).replace(/:/g, '');
      const cell = doc.createElement('div');
      const parts = value.split(',').map((v) => v.trim()).filter(Boolean);
      if (parts.length && parts.every((v) => /^(https?:)?\//.test(v))) {
        parts.forEach((href) => {
          const a = doc.createElement('a');
          a.href = href;
          a.textContent = href;
          cell.append(a);
        });
      } else {
        const para = doc.createElement('p');
        para.textContent = value;
        cell.append(para);
      }
      const row = doc.createElement('div');
      row.append(key, cell);
      table.append(row);
      section.removeAttribute(attr);
    });
    section.append(table);
  });
}

/**
 * Checks if experimentation is enabled.
 * @returns {boolean} True if experimentation is enabled, false otherwise.
 */
const isExperimentationEnabled = () => document.head.querySelector('[name^="experiment"],[name^="campaign-"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]')
  || [...document.querySelectorAll('.section-metadata div')].some((d) => d.textContent.match(/Experiment|Campaign|Audience/i));

/**
 * Loads the experimentation module (eager).
 * @param {Document} document The document object.
 * @param {Object} config The experimentation configuration.
 * @returns {Promise<void>} A promise that resolves when the experimentation module is loaded.
 */
export async function runExperimentation(document, config) {
  restoreSectionMetadata(document);
  if (!isExperimentationEnabled()) {
    window.addEventListener('message', async (event) => {
      if (event.data?.type === 'hlx:experimentation-get-config') {
        event.source.postMessage({
          type: 'hlx:experimentation-config',
          config: { experiments: [], audiences: [], campaigns: [] },
          source: 'no-experiments',
        }, '*');
      }
    });
    return null;
  }

  try {
    // eslint-disable-next-line import/no-relative-packages
    const { loadEager } = await import('../plugins/experimentation/src/index.js');
    return loadEager(document, config);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (eager):', error);
    return null;
  }
}

/**
 * Loads the experimentation simulation UI (lazy). Preview/dev only.
 * @param {Document} document The document object.
 * @param {Object} config The experimentation configuration.
 * @returns {Promise<void>} A promise that resolves when the simulation UI is loaded.
 */
export async function runExperimentationLazy(document, config) {
  const { host, hostname, origin } = window.location;
  const isPreview = hostname === 'localhost'
    || hostname.endsWith('.page')
    || (typeof config.isProd === 'function' && !config.isProd())
    || (config.prodHost && ![host, hostname, origin].includes(config.prodHost));
  if (!isPreview) {
    return null;
  }

  try {
    // eslint-disable-next-line import/no-relative-packages
    const { loadLazy } = await import('../plugins/experimentation/src/index.js');
    return loadLazy(document, config);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load experimentation module (lazy):', error);
    return null;
  }
}
