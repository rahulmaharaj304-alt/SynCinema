export default function manifest() {
  return { name: 'SyncCinema', short_name: 'SyncCinema', description: 'Watch together, wherever you are.', start_url: '/', display: 'standalone',
    background_color: '#181120', theme_color: '#d9467a', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] };
}
