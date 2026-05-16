# nginx configs

One `.conf` file per tool subdomain. Each file is a self-contained server block.

## Adding a new tool

1. Copy an existing `.conf` and update `server_name`, `root`, and the deploy path.
2. `sudo ln -s $(pwd)/nginx/new-tool.conf /etc/nginx/sites-enabled/`
3. `sudo nginx -t && sudo systemctl reload nginx`
4. `sudo certbot --nginx -d new-tool.ajayraj.co`

## Subdomain DNS

Add an A record (or CNAME pointing at the same server as `ajayraj.co`) for each new subdomain in your DNS provider.

## Deploy a tool

```bash
cd tools/cs-anki
npm run build
rsync -av dist/ user@server:/var/www/cs-anki/dist/
```
