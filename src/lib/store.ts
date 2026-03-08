import { create } from 'zustand';

export type CartState = 'ACTIVE' | 'LOCKED' | 'VERIFIED' | 'PAID' | 'CLOSED';

export interface Product {
  barcode: string;
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  image?: string;
  price: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  addedAt: Date;
}

export interface Session {
  id: string;
  state: CartState;
  createdAt: Date;
  items: CartItem[];
  totalAmount: number;
  cartHash?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
}

interface ECartStore {
  // Sessions (simulating multiple customers for demo)
  sessions: Record<string, Session>;
  activeSessionId: string | null;

  // Customer actions
  createSession: () => string;
  addItem: (sessionId: string, product: Product) => void;
  removeItem: (sessionId: string, barcode: string) => void;
  updateQuantity: (sessionId: string, barcode: string, quantity: number) => void;
  lockCart: (sessionId: string) => void;

  // Cashier actions
  verifyCart: (sessionId: string, cashierName: string) => void;
  rejectCart: (sessionId: string) => void;
  markPaid: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;

  // Getters
  getSession: (sessionId: string) => Session | undefined;
  getActiveSessions: () => Session[];
  getLockedSessions: () => Session[];

  setActiveSessionId: (id: string | null) => void;
}

function generateId(): string {
  return `EC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}

function hashCart(items: CartItem[]): string {
  const data = items.map(i => `${i.product.barcode}:${i.quantity}`).sort().join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

export const useECartStore = create<ECartStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  createSession: () => {
    const id = generateId();
    const session: Session = {
      id,
      state: 'ACTIVE',
      createdAt: new Date(),
      items: [],
      totalAmount: 0,
    };
    set(state => ({
      sessions: { ...state.sessions, [id]: session },
      activeSessionId: id,
    }));
    return id;
  },

  addItem: (sessionId, product) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'ACTIVE') return state;

      const existingIndex = session.items.findIndex(i => i.product.barcode === product.barcode);
      let newItems: CartItem[];

      if (existingIndex >= 0) {
        newItems = session.items.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        newItems = [...session.items, { product, quantity: 1, addedAt: new Date() }];
      }

      const totalAmount = calculateTotal(newItems);
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, items: newItems, totalAmount },
        },
      };
    });
  },

  removeItem: (sessionId, barcode) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'ACTIVE') return state;

      const newItems = session.items.filter(i => i.product.barcode !== barcode);
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, items: newItems, totalAmount: calculateTotal(newItems) },
        },
      };
    });
  },

  updateQuantity: (sessionId, barcode, quantity) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'ACTIVE') return state;

      const newItems = quantity <= 0
        ? session.items.filter(i => i.product.barcode !== barcode)
        : session.items.map(i => i.product.barcode === barcode ? { ...i, quantity } : i);

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, items: newItems, totalAmount: calculateTotal(newItems) },
        },
      };
    });
  },

  lockCart: (sessionId) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'ACTIVE' || session.items.length === 0) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            state: 'LOCKED',
            cartHash: hashCart(session.items),
          },
        },
      };
    });
  },

  verifyCart: (sessionId, cashierName) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'LOCKED') return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            state: 'VERIFIED',
            verifiedBy: cashierName,
            verifiedAt: new Date(),
          },
        },
      };
    });
  },

  rejectCart: (sessionId) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'LOCKED') return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, state: 'ACTIVE', cartHash: undefined },
        },
      };
    });
  },

  markPaid: (sessionId) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'VERIFIED') return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, state: 'PAID' },
        },
      };
    });
  },

  closeSession: (sessionId) => {
    set(state => {
      const session = state.sessions[sessionId];
      if (!session || session.state !== 'PAID') return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, state: 'CLOSED' },
        },
      };
    });
  },

  getSession: (sessionId) => get().sessions[sessionId],

  getActiveSessions: () => Object.values(get().sessions).filter(s => s.state !== 'CLOSED'),

  getLockedSessions: () => Object.values(get().sessions).filter(s => s.state === 'LOCKED'),

  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));
