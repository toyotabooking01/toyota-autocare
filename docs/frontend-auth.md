# Frontend authentication and navigation

The React client provides unified login, Client registration and email verification, password recovery by OTP, and temporary-password change where required. Session state is handled by the auth context and API client. Protected routes in `client/src/App.jsx` route each role to its permitted pages; the server independently enforces authorization and ownership.

`client/src/app/navigation.js` defines the Client, Staff, Mechanic, and Admin sidebars. Notifications are reached through the top bar; a notification destination may deep-link to a detail page without appearing in the sidebar. Profile and settings are available from the account menu. Route access must not be inferred from sidebar visibility.

The client API base URL is the public `VITE_API_URL` setting. See [README](../README.md) for local and production setup, and [System Overview](SYSTEM_OVERVIEW.md) for the current role and workflow map. Historical Phase 3B authentication notes are preserved in Git history.
