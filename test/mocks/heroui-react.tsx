import React from "react";
import ReactDOM from "react-dom";

type BaseProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  className?: string;
  classNames?: Record<string, string>;
  isOpen?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  isIconOnly?: boolean;
  onPress?: () => void;
};

type FieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "prefix"
> & {
  label?: React.ReactNode;
  labelPlacement?: string;
  errorMessage?: React.ReactNode;
  isInvalid?: boolean;
  fullWidth?: boolean;
};

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  labelPlacement?: string;
  errorMessage?: React.ReactNode;
  isInvalid?: boolean;
  fullWidth?: boolean;
};

type SelectItemProps = BaseProps & {
  children?: React.ReactNode;
  title?: string;
};

type SelectProps = BaseProps & {
  label?: React.ReactNode;
  labelPlacement?: string;
  placeholder?: string;
  selectedKeys?: Iterable<string>;
  onChange?: (event: { target: { value: string } }) => void;
  "aria-label"?: string;
};

type ElementWithChildrenProps = React.ReactElement<{
  children?: React.ReactNode;
}>;

const getText = (node: React.ReactNode): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getText).join(" ").trim();
  }
  if (React.isValidElement(node)) {
    return getText((node as ElementWithChildrenProps).props.children);
  }
  return "";
};

const toId = (value: React.ReactNode, fallback: string) => {
  const text = getText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return text ? `${fallback}-${text}` : fallback;
};

const normalizeKey = (value: string) => value.replace(/^\.\$/, "");

const getModalLabel = (children: React.ReactNode): string => {
  const childArray = React.Children.toArray(children);
  for (const child of childArray) {
    if (!React.isValidElement(child)) continue;
    const typedChild = child as ElementWithChildrenProps;
    if (typedChild.type === ModalHeader) {
      return getText(typedChild.props.children);
    }
    if (typedChild.type === ModalContent) {
      const contentChildren = React.Children.toArray(typedChild.props.children);
      for (const contentChild of contentChildren) {
        if (
          React.isValidElement(contentChild) &&
          contentChild.type === ModalHeader
        ) {
          return getText(
            (contentChild as ElementWithChildrenProps).props.children
          );
        }
      }
    }
  }
  return "";
};

const renderFieldWrapper = (
  label: React.ReactNode,
  id: string,
  field: React.ReactNode,
  errorMessage?: React.ReactNode
) => (
  <div>
    {label ? <label htmlFor={id}>{label}</label> : null}
    {field}
    {errorMessage ? <div>{errorMessage}</div> : null}
  </div>
);

export const Button = ({
  children,
  onClick,
  onPress,
  isDisabled,
  isLoading,
  type = "button",
  ...props
}: BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    type={type}
    disabled={Boolean(isDisabled || isLoading || props.disabled)}
    onClick={onClick ?? onPress}
  >
    {children}
  </button>
);

export const Input = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, errorMessage, isInvalid, id, ...props }, ref) => {
    const inputId = id ?? toId(label, "input");
    return renderFieldWrapper(
      label,
      inputId,
      <input
        {...props}
        ref={ref}
        id={inputId}
        aria-label={props["aria-label"] ?? (getText(label) || undefined)}
        aria-invalid={isInvalid || undefined}
      />,
      errorMessage
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, errorMessage, isInvalid, id, ...props }, ref) => {
    const textareaId = id ?? toId(label, "textarea");
    return renderFieldWrapper(
      label,
      textareaId,
      <textarea
        {...props}
        ref={ref}
        id={textareaId}
        aria-label={props["aria-label"] ?? (getText(label) || undefined)}
        aria-invalid={isInvalid || undefined}
      />,
      errorMessage
    );
  }
);
Textarea.displayName = "Textarea";

export const Image = (
  props: React.ImgHTMLAttributes<HTMLImageElement> & { fallbackSrc?: string }
) => <img {...props} alt={props.alt ?? ""} />;

export const SelectItem = jest.fn(({ children, ...props }: SelectItemProps) => (
  <div {...props}>{children}</div>
));

export const SelectSection = jest.fn(({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
));

export const Select = jest.fn(
  ({
    children,
    label,
    placeholder,
    selectedKeys,
    onChange,
    id,
    ...props
  }: SelectProps) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const buttonId = id ?? toId(label, "select");
    const selectedValue = Array.from(selectedKeys ?? [])[0] ?? "";

    const items = React.Children.toArray(children).flatMap((child) => {
      if (!React.isValidElement(child)) return [];
      const typedChild = child as ElementWithChildrenProps;
      if (typedChild.type === SelectSection) {
        return React.Children.toArray(typedChild.props.children);
      }
      return [typedChild];
    });

    const selectedItem = items.find((child) => {
      if (!React.isValidElement(child)) return false;
      return child.key === selectedValue;
    });

    const buttonLabel =
      getText(label) || props["aria-label"] || placeholder || "Select option";
    const displayValue = getText(selectedItem) || placeholder || "";

    return (
      <div>
        {label ? <label htmlFor={buttonId}>{label}</label> : null}
        <button
          {...props}
          id={buttonId}
          type="button"
          aria-label={buttonLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {displayValue || buttonLabel}
        </button>
        {isOpen ? (
          <div role="listbox">
            {items.map((child, index) => {
              if (!React.isValidElement(child)) return null;
              const typedChild = child as ElementWithChildrenProps;
              const optionValue = normalizeKey(String(child.key ?? index));
              const optionLabel = getText(typedChild.props.children);
              return (
                <div
                  key={optionValue}
                  role="option"
                  aria-selected={optionValue === selectedValue}
                  onClick={() => {
                    onChange?.({ target: { value: optionValue } });
                    setIsOpen(false);
                  }}
                >
                  {optionLabel}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }
);

export const Tooltip = ({ children }: BaseProps) => <>{children}</>;

export const Spinner = ({
  children,
  ...props
}: BaseProps & { label?: React.ReactNode }) => (
  <div aria-label="Loading" {...props}>
    {getText((props as { label?: React.ReactNode }).label) ||
      children ||
      "Loading..."}
  </div>
);

const ModalHeaderComponent = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
const ModalContentComponent = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
const ModalBodyComponent = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
const ModalFooterComponent = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);

export const ModalHeader = ModalHeaderComponent;
export const ModalContent = ModalContentComponent;
export const ModalBody = ModalBodyComponent;
export const ModalFooter = ModalFooterComponent;

export const Modal = ({
  children,
  isOpen = true,
  onClose,
  ...props
}: BaseProps & { onClose?: () => void; isDismissable?: boolean }) => {
  const portalRoot = React.useMemo(() => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
  }, []);

  React.useEffect(
    () => () => {
      portalRoot.remove();
    },
    [portalRoot]
  );

  if (!isOpen) return null;

  const ariaLabel = getModalLabel(children) || props["aria-label"] || "Dialog";

  return ReactDOM.createPortal(
    <div role="dialog" aria-label={ariaLabel} {...props}>
      {props.isDismissable ? (
        <button type="button" aria-label="Close" onClick={onClose}>
          Close
        </button>
      ) : null}
      {children}
    </div>,
    portalRoot
  );
};

export const Card = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
export const CardBody = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
export const CardHeader = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);
export const CardFooter = ({ children, ...props }: BaseProps) => (
  <div {...props}>{children}</div>
);

export const Avatar = (
  props: React.ImgHTMLAttributes<HTMLImageElement> & { name?: string }
) => <img {...props} alt={props.alt ?? props.name ?? "Avatar"} />;

export const Chip = ({
  children,
  startContent,
  ...props
}: BaseProps & {
  startContent?: React.ReactNode;
}) => (
  <span {...props}>
    {startContent}
    {children}
  </span>
);

export const Divider = (props: React.HTMLAttributes<HTMLHRElement>) => (
  <hr {...props} />
);

export const Link = ({
  children,
  href,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a href={href} {...props}>
    {children}
  </a>
);

export const Breadcrumbs = ({ children, ...props }: BaseProps) => (
  <nav aria-label="Breadcrumbs" {...props}>
    {children}
  </nav>
);

export const BreadcrumbItem = ({
  children,
  onClick,
  className,
  classNames,
  ...props
}: BaseProps) => (
  <button
    type="button"
    onClick={onClick}
    className={className ?? classNames?.item}
    {...props}
  >
    {children}
  </button>
);

export const Switch = ({
  isSelected,
  onValueChange,
  ...props
}: BaseProps & {
  isSelected?: boolean;
  onValueChange?: (selected: boolean) => void;
}) => (
  <input
    {...props}
    type="checkbox"
    role="switch"
    checked={Boolean(isSelected)}
    onChange={(event) => onValueChange?.(event.target.checked)}
  />
);

export const useDisclosure = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  return {
    isOpen,
    onOpen: () => setIsOpen(true),
    onClose: () => setIsOpen(false),
    onOpenChange: () => setIsOpen((value) => !value),
  };
};
