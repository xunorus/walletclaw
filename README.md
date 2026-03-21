# install
yarn

# run
yarn parcel src/index.html src/test.html   --port 3233 --https

# deploy (reminder)
yarn parcel src/index.html --dist-dir public  --public-url ./
firebase deploy --only hosting:walletclaw

# demo (dashboard)
https://walletclaw.web.app/