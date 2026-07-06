/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Serve Firebase's sign-in helper from our own domain. Modern Safari/Chrome
  // block the cross-site storage that redirect sign-in needs when the auth
  // helper lives on firebaseapp.com — proxying it makes it same-site. Requires
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to be set to the app's own domain.
  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
      },
      {
        source: "/__/firebase/:path*",
        destination: `https://${projectId}.firebaseapp.com/__/firebase/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
