import React, {createContext, useContext, useState} from 'react';

const AuthContext = createContext(null);

// Mirrors the current token outside React state so non-component code
// (e.g. the axios interceptor in src/api/client.js) can read it synchronously.
let currentAccessToken = null;
let externalStateSetter = null;

export const getAccessToken = () => currentAccessToken;

// Lets non-component code (the axios refresh interceptor) update the token
// the same way setAccessToken does, keeping React state in sync too.
export const setAccessTokenExternal = token => {
  currentAccessToken = token;
  if (externalStateSetter) externalStateSetter(token);
};

export const AuthProvider = ({children}) => {
  const [accessToken, setAccessTokenState] = useState(null);
  externalStateSetter = setAccessTokenState;

  const setAccessToken = token => {
    currentAccessToken = token;
    setAccessTokenState(token);
  };

  return (
    <AuthContext.Provider value={{accessToken, setAccessToken}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
