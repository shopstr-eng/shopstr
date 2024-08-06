import { createContext, useContext, useState } from "react";

const WalletContext = createContext({
    descriptor: "",
    passphrase: "",
    changeDescriptor: (val: string) => {},
    changePassphrase: (val: string) => {}
});

const WalletProvider = ({ children }: { children: any }) => {
  const [descriptor, setDescriptor] = useState('');
  const [passphrase, setPassphrase] = useState('');

  const changeDescriptor = (newDescriptor: string) => {
    setDescriptor(newDescriptor);
  };

  const changePassphrase = (newPassphrase: string) => {
    setPassphrase(newPassphrase);
  };

  return (
    <WalletContext.Provider value={{ descriptor, passphrase, changeDescriptor, changePassphrase }}>
      {children}
    </WalletContext.Provider>
  );
};

const useWalletContext = () => {
    const context = useContext(WalletContext);
    if (!context) {
      throw new Error('context must be used within context provider');
    }
    return context;
  };

export { WalletProvider, useWalletContext };