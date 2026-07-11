import { forwardRef } from "react";

import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// The one button hierarchy for the app (issue #215): primary for the single
// emphasized forward action, secondary for ordinary actions, ghost for
// low-emphasis/inline actions, destructive for irreversible ones, icon for
// icon-only controls. `data-variant` (not the CSS module class) is the
// stable hook other code/tests key off, since CSS module class names are
// hashed per build.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", type = "button", className, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-variant={variant}
        className={[styles.button, styles[variant], className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  },
);
