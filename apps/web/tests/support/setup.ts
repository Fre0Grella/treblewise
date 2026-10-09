/**
 * Shared by every test. jsdom has no scrolling: the router resets the scroll
 * position on every navigation, so it gets a stand-in that does nothing.
 */

window.scrollTo = () => undefined;
