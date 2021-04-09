/* eslint-disable no-new */
/* global window */

import { 
  OktaAuth, 
  REFERRER_PATH_STORAGE_KEY 
} from '@okta/okta-auth-js';
import tokens from '@okta/test.support/tokens';
import storageUtil from '../../../lib/browser/browserStorage';

describe('OktaAuth (browser)', function() {
  let auth;
  let issuer;
  let originalLocation;

  afterEach(() => {
    global.window.location = originalLocation;
  });

  beforeEach(function() {
    originalLocation = global.window.location;
    delete global.window.location;
    global.window.location = {
      protocol: 'https:',
      hostname: 'somesite.local',
      href: 'https://somesite.local',
      replace: jest.fn()
    } as unknown as Location;

    issuer =  'http://my-okta-domain';
    auth = new OktaAuth({ issuer, pkce: false });
  });

  describe('options', function() {
    describe('cookies', () => {

      it('"secure" is true by default on HTTPS', () => {
        expect(auth.options.cookies.secure).toBe(true);
      });

      it('"sameSite" is "none" by default', () => {
        expect(auth.options.cookies.sameSite).toBe('none');
      });

      it('"secure" can be set to false on HTTPS', () => {
        auth = new OktaAuth({ issuer, pkce: false, cookies: { secure: false } });
        expect(auth.options.cookies.secure).toBe(false);
        expect(auth.options.cookies.sameSite).toBe('lax');
      });

      it('"sameSite" is "lax" if secure is false', () => {
        auth = new OktaAuth({ issuer, pkce: false, cookies: { secure: false }});
        expect(auth.options.cookies.sameSite).toBe('lax');
      });

      it('"secure" is false by default on HTTP', () => {
        window.location.protocol = 'http:';
        window.location.hostname = 'my-site';
        auth = new OktaAuth({ issuer, pkce: false });
        expect(auth.options.cookies.secure).toBe(false);
        expect(auth.options.cookies.sameSite).toBe('lax');
      });

      it('"secure" is forced to false if running on HTTP', () => {
        window.location.protocol = 'http:';
        window.location.hostname = 'my-site';
        auth = new OktaAuth({ issuer, pkce: false, cookies: { secure: true }});
        expect(auth.options.cookies.secure).toBe(false);
        expect(auth.options.cookies.sameSite).toBe('lax');
      });

      it('"sameSite" is forced to "lax" if running on HTTP', () => {
        window.location.protocol = 'http:';
        window.location.hostname = 'my-site';
        auth = new OktaAuth({ issuer, pkce: false, cookies: { sameSite: 'none' }});
        expect(auth.options.cookies.secure).toBe(false);
        expect(auth.options.cookies.sameSite).toBe('lax');
      });

      it('console warning if secure is forced to false running on HTTP', () => {
        window.location.protocol = 'http:';
        window.location.hostname = 'my-site';
        jest.spyOn(console, 'warn').mockReturnValue(null);
        auth = new OktaAuth({ issuer: 'http://my-okta-domain' , cookies: { secure: true }});
        
        // eslint-disable-next-line no-console
        expect(console.warn).toHaveBeenCalledWith(
          '[okta-auth-sdk] WARN: The current page is not being served with the HTTPS protocol.\n' +
          'For security reasons, we strongly recommend using HTTPS.\n' +
          'If you cannot use HTTPS, set "cookies.secure" option to false.'
        );
      });

      it('does not throw if running on HTTP and cookies.secure = false', () => {
        global.window.location.protocol = 'http:';
        window.location.hostname = 'not-localhost';
        function fn() {
          auth = new OktaAuth({ cookies: { secure: false }, issuer: 'http://my-okta-domain', pkce: false });
        }
        expect(fn).not.toThrow();
      });

    });
  });

  describe('signInWithRedirect', () => {
    let setItemMock;
    beforeEach(() => {
      auth.token.getWithRedirect = jest.fn().mockResolvedValue('fake');
      setItemMock = jest.fn();
      storageUtil.getSessionStorage = jest.fn().mockImplementation(() => ({
        setItem: setItemMock
      }));
    });

    it('should add originalUri to sessionStorage if provided in options', async () => {
      const originalUri = 'notrandom';
      await auth.signInWithRedirect({ originalUri });
      expect(setItemMock).toHaveBeenCalledWith(REFERRER_PATH_STORAGE_KEY, originalUri);
    });

    it('should not add originalUri to sessionStorage if no originalUri in options', async () => {
      await auth.signInWithRedirect();
      expect(setItemMock).not.toHaveBeenCalled();
    });

    // TODO: remove this test when default scopes are changed OKTA-343294
    it('should use default scopes if none is provided', async () => {
      await auth.signInWithRedirect({ foo: 'bar' });
      expect(auth.token.getWithRedirect).toHaveBeenCalledWith({
        foo: 'bar',
        scopes: ['openid', 'email', 'profile']
      });
    });

    it('should use provided scopes and responseType', async () => {
      const params = { scopes: ['openid'], responseType: ['token'] };
      await auth.signInWithRedirect(params);
      expect(auth.token.getWithRedirect).toHaveBeenCalledWith(params);
    });

    it('should passes "additionalParams" to token.getWithRedirect()', () => {
      const additionalParams = { foo: 'bar', baz: 'biz', scopes: ['fake'], responseType: ['fake'] };
      const params = { originalUri: 'https://foo.random', ...additionalParams };
      auth.signInWithRedirect(params);
      expect(auth.token.getWithRedirect).toHaveBeenCalledWith(additionalParams);
    });

    it('should not trigger second call if signIn flow is in progress', () => {
      expect.assertions(1);
      return Promise.all([auth.signInWithRedirect(), auth.signInWithRedirect()]).then(() => {
        expect(auth.token.getWithRedirect).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('signOut', function() {
    let origin;
    let href;
    let encodedOrigin;
  
    beforeEach(function() {
      origin = 'https://somesite.local';
      href = `${origin}/some-route`;
      encodedOrigin = encodeURIComponent(origin);
      Object.assign(global.window.location, {
        origin,
        href,
        assign: jest.fn(),
        reload: jest.fn()
      });
    });

    describe('with idToken and accessToken', () => {
      let idToken;
      let accessToken;

      function initSpies() {
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ accessToken, idToken });
        spyOn(auth.tokenManager, 'clear');
        spyOn(auth, 'revokeAccessToken').and.returnValue(Promise.resolve());
        spyOn(auth, 'revokeRefreshToken').and.returnValue(Promise.resolve());
        spyOn(auth, 'closeSession').and.returnValue(Promise.resolve());
      }

      beforeEach(() => {
        accessToken = { accessToken: 'fake' };
        idToken = { idToken: 'fake' };
        initSpies();
      });

      it('Default options when no refreshToken: will revokeAccessToken and use window.location.origin for postLogoutRedirectUri', function() {
        return auth.signOut()
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(3);
            expect(auth.revokeRefreshToken).not.toHaveBeenCalled();
            expect(auth.revokeAccessToken).toHaveBeenCalledWith(accessToken);
            expect(auth.tokenManager.clear).toHaveBeenCalled();
            expect(auth.closeSession).not.toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });

      it('Default options when refreshToken present: will revokeRefreshToken and use window.location.origin for postLogoutRedirectUri', function() {
        const refreshToken = { refreshToken: 'fake'};
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ accessToken, idToken, refreshToken });

        return auth.signOut()
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(3);
            expect(auth.revokeAccessToken).toHaveBeenCalledWith(accessToken);
            expect(auth.revokeRefreshToken).toHaveBeenCalledWith(refreshToken);
            expect(auth.tokenManager.clear).toHaveBeenCalled();
            expect(auth.closeSession).not.toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });

      it('supports custom authorization server', function() {
        issuer = 'http://my-okta-domain/oauth2/custom-as';
        auth = new OktaAuth({
          pkce: false,
          issuer
        });
        initSpies();
        return auth.signOut()
          .then(function() {
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });

      it('if idToken is passed, will skip token manager read', function() {
        var customToken = { idToken: 'fake-custom' };
        return auth.signOut({ idToken: customToken })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${customToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });
  
      it('if idToken=false will skip token manager read and call closeSession', function() {
        return auth.signOut({ idToken: false })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(window.location.origin);
          });
      });
  
      it('if idToken=false and origin===href will reload the page', function() {
        global.window.location.href = origin;
        return auth.signOut({ idToken: false })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.reload).toHaveBeenCalled();
          });
      });

      describe('postLogoutRedirectUri', function() {
        it('can be set by config', function() {
          const postLogoutRedirectUri = 'http://someother';
          const encodedUri = encodeURIComponent(postLogoutRedirectUri);
          auth = new OktaAuth({
            pkce: false,
            issuer,
            postLogoutRedirectUri
          });
          initSpies();
          return auth.signOut()
            .then(function() {
              expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedUri}`);
            });
        });
        it('can be passed as an option', function() {
          const postLogoutRedirectUri = 'http://someother';
          const encodedUri = encodeURIComponent(postLogoutRedirectUri);
          return auth.signOut({ postLogoutRedirectUri })
            .then(function() {
              expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedUri}`);
            });
        });
      });

      it('Can pass a "state" option', function() {
        const state = 'foo=bar&yo=me';
        const encodedState = encodeURIComponent(state);
        return auth.signOut({ state })
          .then(function() {
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}&state=${encodedState}`);
          });
      });

      it('Can pass a "revokeAccessToken=false" to skip revoke logic', function() {
        const refreshToken = { refreshToken: 'fake'};
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ accessToken, idToken, refreshToken });

        return auth.signOut({ revokeAccessToken: false })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(auth.revokeAccessToken).not.toHaveBeenCalled();
            expect(auth.revokeRefreshToken).toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });

      it('Can pass a "revokeRefreshToken=false" to skip revoke logic', function() {
        const refreshToken = { refreshToken: 'fake'};
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ accessToken, idToken, refreshToken });
        
        return auth.signOut({ revokeRefreshToken: false })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(auth.revokeAccessToken).toHaveBeenCalled();
            expect(auth.revokeRefreshToken).not.toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });

      it('Can pass a "accessToken=false" to skip accessToken logic', function() {
        return auth.signOut({ accessToken: false })
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(2);
            expect(auth.revokeAccessToken).not.toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
          });
      });
    });

    describe('without idToken', () => {
      let accessToken;

      beforeEach(() => {
        accessToken = { accessToken: 'fake' };
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ accessToken });
        spyOn(auth.tokenManager, 'clear');
        spyOn(auth, 'revokeAccessToken').and.returnValue(Promise.resolve());
      });

      it('Default options: will revokeAccessToken and fallback to closeSession and redirect to window.location.origin', function() {
        spyOn(auth, 'closeSession').and.returnValue(Promise.resolve());
        return auth.signOut()
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(3);
            expect(auth.revokeAccessToken).toHaveBeenCalledWith(accessToken);
            expect(auth.tokenManager.clear).toHaveBeenCalled();
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.assign).toHaveBeenCalledWith(window.location.origin);
          });
      });

      it('Default options: if href===origin will reload the page', function() {
        spyOn(auth, 'closeSession').and.returnValue(Promise.resolve());
        global.window.location.href = origin;
        return auth.signOut()
          .then(function() {
            expect(auth.tokenManager.getTokens).toHaveBeenCalledTimes(3);
            expect(auth.revokeAccessToken).toHaveBeenCalledWith(accessToken);
            expect(auth.tokenManager.clear).toHaveBeenCalled();
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.reload).toHaveBeenCalled();
          });
      });

      it('Default options: will throw exceptions from closeSession and not call window.location.reload', function() {
        const testError = new Error('test error');
        spyOn(auth, 'closeSession').and.callFake(function() {
          return Promise.reject(testError);
        });
        return auth.signOut()
          .then(function() {
            expect(false).toBe(true);
          })
          .catch(function(e) {
            expect(e).toBe(testError);
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.reload).not.toHaveBeenCalled();
          });
      });

      it('with postLogoutRedirectUri: will call window.location.assign', function() {
        const postLogoutRedirectUri = 'http://someother';
        spyOn(auth, 'closeSession').and.returnValue(Promise.resolve());
        return auth.signOut({ postLogoutRedirectUri })
          .then(function() {
            expect(window.location.assign).toHaveBeenCalledWith(postLogoutRedirectUri);
          });
      });

      it('with postLogoutRedirectUri: will throw exceptions from closeSession and not call window.location.assign', function() {
        const postLogoutRedirectUri = 'http://someother';
        const testError = new Error('test error');
        spyOn(auth, 'closeSession').and.callFake(function() {
          return Promise.reject(testError);
        });
        return auth.signOut({ postLogoutRedirectUri })
          .then(function() {
            expect(false).toBe(true);
          })
          .catch(function(e) {
            expect(e).toBe(testError);
            expect(auth.closeSession).toHaveBeenCalled();
            expect(window.location.assign).not.toHaveBeenCalled();
          });
      });
    });

    describe('without accessToken', () => {
      let idToken;
      beforeEach(() => {
        idToken = { idToken: 'fake' };
        auth.tokenManager.getTokens = jest.fn().mockResolvedValue({ idToken });
        spyOn(auth.tokenManager, 'clear');
        spyOn(auth, 'revokeAccessToken').and.returnValue(Promise.resolve());
      });

      it('Default options: will not revoke accessToken', () => {
        return auth.signOut()
        .then(function() {
          expect(auth.revokeAccessToken).not.toHaveBeenCalled();
          expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
        });
      });

      it('Can pass an accessToken', () => {
        const accessToken = { accessToken: 'custom-fake' };
        return auth.signOut({ accessToken })
        .then(function() {
          expect(auth.revokeAccessToken).toHaveBeenCalledWith(accessToken);
          expect(window.location.assign).toHaveBeenCalledWith(`${issuer}/oauth2/v1/logout?id_token_hint=${idToken.idToken}&post_logout_redirect_uri=${encodedOrigin}`);
        });
      });
    });

  });

  describe('storeTokensFromRedirect', () => {
    beforeEach(() => {
      auth.token.parseFromUrl = jest.fn().mockResolvedValue({ 
        tokens: { idToken: 'fakeIdToken', accessToken: 'fakeAccessToken' }
      });
      auth.tokenManager.setTokens = jest.fn();
    });
    it('calls parseFromUrl', async () => {
      await auth.storeTokensFromRedirect();
      expect(auth.token.parseFromUrl).toHaveBeenCalled();
    });
    it('stores tokens', async () => {
      const accessToken = { accessToken: 'foo' };
      const idToken = { idToken: 'bar' };
      auth.token.parseFromUrl = jest.fn().mockResolvedValue({ 
        tokens: { accessToken, idToken }
      });
      await auth.storeTokensFromRedirect();
      expect(auth.tokenManager.setTokens).toHaveBeenCalledWith({ accessToken, idToken });
    });
  });

  describe('setOriginalUri', () => {
    let setItemMock;
    beforeEach(() => {
      setItemMock = jest.fn();
      storageUtil.getSessionStorage = jest.fn().mockImplementation(() => ({
        setItem: setItemMock
      }));
    });
    it('should save the "referrerPath" in sessionStorage', () => {
      const uri = 'https://foo.random';
      auth.setOriginalUri(uri);
      expect(setItemMock).toHaveBeenCalledWith(REFERRER_PATH_STORAGE_KEY, uri);
    });
    it('does not have a default value', () => {
      auth.setOriginalUri();
      expect(setItemMock).toHaveBeenCalledWith(REFERRER_PATH_STORAGE_KEY, undefined);
    });
  });

  describe('getOriginalUri', () => {
    let removeItemMock;
    let getItemMock;
    beforeEach(() => {
      removeItemMock = jest.fn();
      getItemMock = jest.fn().mockReturnValue('fakeOriginalUri');
      storageUtil.getSessionStorage = jest.fn().mockImplementation(() => ({
        getItem: getItemMock,
        removeItem: removeItemMock
      }));
    });
    it('should get and cleare referrer from storage', () => {
      const res = auth.getOriginalUri();
      expect(res).toBe('fakeOriginalUri');
    });
    it('returns null if nothing was set', () => {
      getItemMock = jest.fn().mockReturnValue(null);
      const res = auth.getOriginalUri();
      expect(res).toBe(null);
    });
  });

  describe('removeOriginalUri', () => {
    let removeItemMock;
    beforeEach(() => {
      removeItemMock = jest.fn();
      storageUtil.getSessionStorage = jest.fn().mockImplementation(() => ({
        removeItem: removeItemMock
      }));
    });
    it('should cleare referrer from localStorage', () => {
      auth.removeOriginalUri();
      expect(removeItemMock).toHaveBeenCalledWith(REFERRER_PATH_STORAGE_KEY);
    });
  });

  describe('handleLoginRedirect', () => {
    beforeEach(() => {
      jest.spyOn(auth.authStateManager, 'unsubscribe');
      jest.spyOn(auth, 'getOriginalUri').mockReturnValue('/fakeuri');
      jest.spyOn(auth, 'removeOriginalUri');
      jest.spyOn(auth.tokenManager, 'hasExpired').mockReturnValue(false);
    });

    it('should redirect to originalUri when tokens are provided', async () => {
      await auth.handleLoginRedirect({
        accessToken: tokens.standardAccessTokenParsed,
        idToken: tokens.standardIdTokenParsed
      });
      return new Promise(resolve => {
        // wait for the next emitted authState
        setTimeout(() => {
          expect(auth.authStateManager.unsubscribe).toHaveBeenCalled();
          expect(auth.getOriginalUri).toHaveBeenCalled();
          expect(auth.removeOriginalUri).toHaveBeenCalled();
          expect(window.location.replace).toHaveBeenCalledWith('/fakeuri');
          resolve(undefined);    
        }, 100);
      });
    });

    it('should get tokens from the callback url when under login redirect flow', async () => {
      auth.token.parseFromUrl = jest.fn().mockResolvedValue({
        tokens: {
          accessToken: tokens.standardAccessTokenParsed,
          idToken: tokens.standardIdTokenParsed
        }
      });
      auth.isLoginRedirect = jest.fn().mockReturnValue(true);
      await auth.handleLoginRedirect();
      return new Promise(resolve => {
        // wait for the next emitted authState
        setTimeout(() => {
          expect(auth.authStateManager.unsubscribe).toHaveBeenCalled();
          expect(auth.getOriginalUri).toHaveBeenCalled();
          expect(auth.removeOriginalUri).toHaveBeenCalled();
          expect(window.location.replace).toHaveBeenCalledWith('/fakeuri');
          resolve(undefined);    
        }, 100);
      });
    });

    it('should use options.restoreOriginalUri if provided', async () => {
      auth.options.restoreOriginalUri = jest.fn();
      auth.token.parseFromUrl = jest.fn().mockResolvedValue({
        tokens: {
          accessToken: tokens.standardAccessTokenParsed,
          idToken: tokens.standardIdTokenParsed
        }
      });
      auth.isLoginRedirect = jest.fn().mockReturnValue(true);
      await auth.handleLoginRedirect();
      return new Promise(resolve => {
        // wait for the next emitted authState
        setTimeout(() => {
          expect(auth.authStateManager.unsubscribe).toHaveBeenCalled();
          expect(auth.getOriginalUri).toHaveBeenCalled();
          expect(auth.removeOriginalUri).toHaveBeenCalled();
          expect(auth.options.restoreOriginalUri).toHaveBeenCalledWith(auth, '/fakeuri');
          expect(window.location.replace).not.toHaveBeenCalled();
          resolve(undefined);    
        }, 100);
      });
    });

    it('should unsubscribe authState listener if neither tokens are provided, nor under login redirect flow', async () => {
      auth.isLoginRedirect = jest.fn().mockReturnValue(false);
      await auth.handleLoginRedirect();
      return new Promise(resolve => {
        // wait for the next emitted authState
        setTimeout(() => {
          expect(auth.authStateManager.unsubscribe).toHaveBeenCalled();
          expect(auth.getOriginalUri).not.toHaveBeenCalled();
          expect(auth.removeOriginalUri).not.toHaveBeenCalled();
          expect(window.location.replace).not.toHaveBeenCalled();
          resolve(undefined);    
        }, 100);
      });
    });
  });

});