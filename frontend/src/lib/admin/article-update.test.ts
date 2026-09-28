import { describe, expect, it } from 'vitest';
import { ore, type Article, type CreateArticleInput } from 'shared';
import { toArticleUpdate } from './article-update';

const article: Article = {
  id: 'a1',
  sku: 'OLJA-5W30',
  name: 'Motorolja 5W-30',
  description: 'Syntetisk',
  unit: 'LITRE',
  salesPriceOre: ore(12900),
  purchasePriceOre: ore(8000),
  vatRateBps: 1200,
  stockQuantity: '12.500',
  minimumQuantity: '20',
  location: 'Hylla B3',
  oeNumbers: ['A0009898301'],
  isActive: true,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

function formOutput(
  overrides: Partial<CreateArticleInput> = {},
): CreateArticleInput {
  return {
    sku: article.sku,
    name: article.name,
    description: 'Syntetisk',
    unit: article.unit,
    salesPriceOre: article.salesPriceOre,
    purchasePriceOre: ore(8000),
    vatRateBps: article.vatRateBps,
    minimumQuantity: article.minimumQuantity,
    location: 'Hylla B3',
    oeNumbers: [...article.oeNumbers],
    ...overrides,
  };
}

describe('toArticleUpdate', () => {
  it('sends nothing when nothing changed', () => {
    expect(toArticleUpdate(article, formOutput())).toEqual({});
  });

  it('sends only the fields that changed', () => {
    expect(
      toArticleUpdate(article, formOutput({ name: 'Motorolja 0W-20' })),
    ).toEqual({
      name: 'Motorolja 0W-20',
    });
  });

  it('does not echo unchanged price fields, so a mechanic’s edit is not a price change', () => {
    const patch = toArticleUpdate(
      article,
      formOutput({ location: 'Hylla C1' }),
    );
    expect(patch).toEqual({ location: 'Hylla C1' });
    expect(patch).not.toHaveProperty('vatRateBps');
    expect(patch).not.toHaveProperty('salesPriceOre');
  });

  it('clears an optional field with null rather than leaving it absent', () => {
    const cleared: CreateArticleInput = formOutput();
    delete cleared.purchasePriceOre;
    delete cleared.location;
    expect(toArticleUpdate(article, cleared)).toEqual({
      purchasePriceOre: null,
      location: null,
    });
  });

  it('treats a blanked description as cleared, not as an empty string', () => {
    expect(
      toArticleUpdate(article, formOutput({ description: '   ' })),
    ).toEqual({
      description: null,
    });
  });

  it('does not clear a field that was already empty', () => {
    const empty: Article = { ...article, location: null, description: null };
    const values = formOutput();
    delete values.location;
    delete values.description;
    expect(toArticleUpdate(empty, values)).toEqual({});
  });

  it('compares quantities numerically, so "20" and "20.000" are the same', () => {
    expect(
      toArticleUpdate(article, formOutput({ minimumQuantity: '20.000' })),
    ).toEqual({});
  });

  it('compares OE numbers as a list', () => {
    expect(
      toArticleUpdate(
        article,
        formOutput({ oeNumbers: ['A0009898301', 'X1'] }),
      ),
    ).toEqual({
      oeNumbers: ['A0009898301', 'X1'],
    });
  });
});
