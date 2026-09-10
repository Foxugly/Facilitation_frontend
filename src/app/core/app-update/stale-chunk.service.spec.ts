import { describe, expect, it } from 'vitest';

import { isStaleChunkError } from './stale-chunk.service';

describe('detection du chunk perime', () => {
  it('reconnait la formulation de chaque navigateur', () => {
    // Un seul de ces libelles suffit a rater le cas en production : Chrome et
    // Firefox ne disent pas la meme chose pour exactement la meme panne.
    const messages = [
      'Failed to fetch dynamically imported module: https://facilitation.foxugly.com/chunk-6EYZE7OG.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 42 failed.',
    ];
    for (const message of messages) {
      expect(isStaleChunkError(new Error(message)), message).toBe(true);
    }
  });

  it('reconnait ChunkLoadError par son nom, meme sans message parlant', () => {
    const error = new Error('');
    error.name = 'ChunkLoadError';
    expect(isStaleChunkError(error)).toBe(true);
  });

  it('accepte autre chose qu une Error (rejet de promesse non typee)', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isStaleChunkError({ message: 'Loading chunk 7 failed.' })).toBe(true);
  });

  it('ignore les erreurs sans rapport', () => {
    // Le garde-fou qui compte : recharger la page sur une erreur reseau ou une
    // 500 ferait perdre son travail a l utilisateur sans rien reparer.
    expect(isStaleChunkError(new Error('Http failure response: 500 Internal Server Error'))).toBe(
      false,
    );
    expect(isStaleChunkError(new Error('NG04002: Cannot match any routes'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
