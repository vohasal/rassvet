interface Window {
  Telegram?: {
    WebApp: {
      initData: string;
      ready: () => void;
      expand: () => void;
      requestContact?: (callback: (sent: boolean) => void) => void;
      colorScheme: string;
      HapticFeedback?: { impactOccurred: (style: string) => void };
      BackButton: {
        show: () => void;
        hide: () => void;
        onClick: (fn: () => void) => void;
        offClick: (fn: () => void) => void;
      };
    };
  };
  ymaps?: any;
}
