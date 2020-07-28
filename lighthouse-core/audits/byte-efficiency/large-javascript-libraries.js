/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview This audit checks a page for any large JS libraries with smaller alternatives.
 * These libraries can be replaced with functionally equivalent, smaller ones.
 */

'use strict';

/** @typedef {import('bundle-phobia-cli').BundlePhobiaLibrary} BundlePhobiaLibrary */

/** @type {Record<string, Record<string, BundlePhobiaLibrary>>} */
const libStats = require('../../lib/large-javascript-libraries/bundlephobia-database.json');

/** @type {Record<string, string[]>} */
const librarySuggestions = require('../../lib/large-javascript-libraries/library-suggestions.js').suggestions;

const ByteEfficiencyAudit = require('./byte-efficiency-audit.js');
const i18n = require('../../lib/i18n/i18n.js');

const UIStrings = {
  /** Title of a Lighthouse audit that provides detail on large Javascript libraries that are used on the page that have better alternatives. This descriptive title is shown when to users when no known unnecessarily large libraries are detected on the page.*/
  title: 'Avoids unnecessarily large JavaScript libraries',
  /** Title of a Lighthouse audit that provides detail on large Javascript libraries that are used on the page that have better alternatives. This descriptive title is shown when to users when some known unnecessarily large libraries are detected on the page.*/
  failureTitle: 'Replace unnecessarily large JavaScript libraries',
  /** Description of a Lighthouse audit that tells the user why they should care about the large Javascript libraries that have better alternatives. This is displayed after a user expands the section to see more. No character length limits. */
  description: 'Large JavaScript libraries can lead to poor performance. ' +
    'Prefer smaller, functionally equivalent libraries to reduce your bundle size.' +
    ' [Learn more](https://developers.google.com/web/fundamentals/performance/webpack/decrease-frontend-size#optimize_dependencies).',
  /** Label for a column in a data table. Entries will be names of large JavaScript libraries that could be replaced. */
  name: 'Library',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

class LargeJavascriptLibraries extends ByteEfficiencyAudit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'large-javascript-libraries',
      title: str_(UIStrings.title),
      failureTitle: str_(UIStrings.failureTitle),
      description: str_(UIStrings.description),
      scoreDisplayMode: ByteEfficiencyAudit.SCORING_MODES.NUMERIC,
      requiredArtifacts: ['Stacks'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {ByteEfficiencyAudit.ByteEfficiencyProduct}
   */
  static audit(artifacts) {
    /** @type {Array<{original: any, suggestions: any[]}>} */
    const libraryPairings = [];
    const detectedLibs = artifacts.Stacks.filter(stack => stack.detector === 'js');

    const seenLibraries = new Set();

    for (const detectedLib of detectedLibs) {
      if (!detectedLib.npm || !libStats[detectedLib.npm]) continue;
      const suggestions = librarySuggestions[detectedLib.npm] || [];

      if (seenLibraries.has(detectedLib.npm)) continue;
      seenLibraries.add(detectedLib.npm);

      let version = 'latest';
      if (detectedLib.version && libStats[detectedLib.npm][detectedLib.version]) {
        version = detectedLib.version;
      }

      const originalLib = libStats[detectedLib.npm][version];
      let smallerSuggestions = suggestions.map(suggestion => {
        if (libStats[suggestion]['latest'].gzip > originalLib.gzip) return;

        return {
          name: suggestion,
          repository: libStats[suggestion].repository,
          gzip: libStats[suggestion]['latest'].gzip,
        };
      });

      smallerSuggestions = smallerSuggestions.sort((a, b) => a.gzip - b.gzip);
      if (smallerSuggestions.length) {
        libraryPairings.push({
          original: {
            gzip: originalLib.gzip,
            name: detectedLib.npm,
            repository: libStats[detectedLib.npm].repository,
          },
          suggestions: smallerSuggestions,
        });
      }
    }

    const items = [];
    for (const libraryPairing of libraryPairings) {
      const original = libraryPairing.original;
      const suggestions = libraryPairing.suggestions;
      const suggestionItems = suggestions.map(suggestion => {
        return {
          suggestion: {
            text: suggestion.name,
            url: suggestion.repository,
            type: 'link',
          },
          transferSize: suggestion.gzip,
          wastedBytes: original.gzip - suggestion.gzip,
        };
      });

      items.push({
        name: {
          text: original.name,
          url: original.repository,
          type: 'link',
        },
        transferSize: original.gzip,
        wastedBytes: 0,
        subItems: {
          type: 'subitems',
          items: suggestionItems,
        },
      });
    }

    /** @type {LH.Audit.Details.Opportunity['headings']} */
    const headings = [
      /* eslint-disable max-len */
      {key: 'name', valueType: 'url', subItemsHeading: {key: 'suggestion'}, label: str_(UIStrings.name)},
      {key: 'transferSize', valueType: 'bytes', subItemsHeading: {key: 'transferSize'}, label: str_(i18n.UIStrings.columnTransferSize)},
      {key: 'wastedBytes', valueType: 'bytes', subItemsHeading: {key: 'wastedBytes'}, label: str_(i18n.UIStrings.columnWastedBytes)},
      /* eslint-enable max-len */
    ];

    return {
      items,
      headings,
    };
  }
}

module.exports = LargeJavascriptLibraries;
module.exports.UIStrings = UIStrings;
