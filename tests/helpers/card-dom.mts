import type {TestContext} from "node:test";

export class CardElement {
  className = "";
  textContent = "";
  innerHTML = "";
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: {stopPropagation(): void}) => void>();
  children: CardElement[] = [];
  parent: CardElement | null = null;
  scrollTop = 0;
  tabIndex = 0;
  focused = false;
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    add: (name: string) => {
      if (!this.classList.contains(name)) this.className += ` ${name}`;
    },
  };
  tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  get offsetTop() {
    return (this.parent?.children.indexOf(this) ?? 0) * 48;
  }
  append(...children: CardElement[]) {
    children.forEach(child => {
      child.parent = this;
      this.children.push(child);
    });
  }
  insertBefore(child: CardElement, before: CardElement | null) {
    child.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  getAttribute(key: string) {
    return this.attributes.get(key) ?? null;
  }
  addEventListener(name: string, listener: (event: {stopPropagation(): void}) => void) {
    this.listeners.set(name, listener);
  }
  dispatch(name: string) {
    this.listeners.get(name)?.({stopPropagation() {}});
  }
  focus() {
    this.focused = true;
  }
  all(): CardElement[] {
    return [this, ...this.children.flatMap(child => child.all())];
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): CardElement[] {
    return this.children
      .flatMap(child => child.all())
      .filter(child =>
        selector.startsWith(".")
          ? child.classList.contains(selector.slice(1))
          : child.tag === selector,
      );
  }
  getBoundingClientRect() {
    return {
      left: 16,
      right: 296,
      top: 80,
      bottom: 280,
      width: 280,
      height: this.tag === "section" ? 200 : 40,
    };
  }
}

export function installCardDOM(t: TestContext, observe = false) {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
  const set = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, value});
  };
  set("document", {createElement: (tag: string) => new CardElement(tag)});
  set("requestAnimationFrame", (callback: () => void) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  set("cancelAnimationFrame", (id: number) => frames.delete(id));
  const observers: {targets: Set<CardElement>; callback: () => void; disconnected: boolean}[] = [];
  if (observe) {
    set(
      "ResizeObserver",
      class {
        record: (typeof observers)[number];
        constructor(callback: () => void) {
          this.record = {targets: new Set(), callback, disconnected: false};
          observers.push(this.record);
        }
        observe(target: CardElement) {
          this.record.targets.add(target);
        }
        unobserve(target: CardElement) {
          this.record.targets.delete(target);
        }
        disconnect() {
          this.record.targets.clear();
          this.record.disconnected = true;
        }
      },
    );
  }
  t.after(() =>
    originals.forEach((descriptor, name) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }),
  );
  return {
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    },
    frames,
    observers,
  };
}
