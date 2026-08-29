import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

const properties = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/properties' }),
  schema: z.object({
    title: z.string(),
    city: z.string(),
    state: z.string().default('GA'),
    address: z.string(),
    units: z
      .array(
        z.object({
          label: z.string(),
          bedrooms: z.number().int().positive(),
          bathrooms: z.number().positive(),
          available: z.boolean().default(false),
        }),
      )
      .min(1),
    summary: z.string(),
    highlights: z.array(z.string()).default([]),
    neighborhood: z.string().optional(),
    neighborhoodSlug: z.enum(['historic-downtown', 'north-cartersville']).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    heading: z.number().optional(),
    tilt: z.number().optional(),
    panoId: z.string().optional(),
    zillowUrl: z.string().url().optional(),
    order: z.number().int().default(0),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

const neighborhoods = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/neighborhoods' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    teaser: z.string(),
    order: z.number().int().default(0),
    calendar: z
      .object({
        label: z.string(),
        href: z.string().url(),
      })
      .optional(),
    places: z
      .array(
        z.object({
          category: z.string(),
          name: z.string(),
          note: z.string(),
          href: z.string().url().optional(),
        }),
      )
      .default([]),
  }),
});

export const collections = { properties, pages, neighborhoods };
