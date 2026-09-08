'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Sonner is themed through custom properties, which `React.CSSProperties`
 * does not describe. The generated file reached for `as React.CSSProperties`
 * on the object literal — banned by CLAUDE.md, and for a good reason: the
 * cast would have silenced a genuine typo in a property name just as
 * happily. Widening the *type* to admit `--*` keys keeps every other key
 * checked.
 */
type CustomProperties = React.CSSProperties & Record<`--${string}`, string>;

const toastSurface: CustomProperties = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-soft)',
};

/**
 * The toast surface (F1.5.1).
 *
 * The generated wrapper read the active theme through `next-themes` and
 * passed it to Sonner. That dependency was removed: this project has no
 * theme switching by design — the public and admin surfaces are two fixed
 * palettes selected by the `.admin-scope` class, not a user preference
 * (§9.1, F0.2.5). `theme="light"` pins Sonner's own stylesheet to its
 * neutral base, and the CSS variables below then repaint it from whichever
 * scope the toaster is mounted in, so a toast raised inside the admin panel
 * is steel and one on the public site is concrete. Leaving it on `"system"`
 * would have let the visitor's OS setting restyle toasts and nothing else.
 *
 * Icons are passed explicitly because §9.2 makes colour information rather
 * than decoration: a toast must not rely on its tint alone to say whether it
 * succeeded, which is also what makes it readable on a garage tablet in
 * daylight and to a colourblind user.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // §9.6: async results are announced. Errors interrupt; the rest wait.
      icons={{
        success: <CircleCheckIcon className="size-4 text-status-moss" />,
        info: <InfoIcon className="size-4 text-status-signal" />,
        warning: <TriangleAlertIcon className="size-4 text-status-hivis" />,
        error: <OctagonXIcon className="size-4 text-status-oxide" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={toastSurface}
      {...props}
    />
  );
}

export { Toaster };
