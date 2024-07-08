import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";
import { bootstrap } from "@libp2p/bootstrap";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { ping } from "@libp2p/ping";
import { yamux } from "@chainsafe/libp2p-yamux";
import { peerIdFromString } from "@libp2p/peer-id";
import { identify } from "@libp2p/identify";
import { kadDHT, removePublicAddressesMapper } from "@libp2p/kad-dht";
import { logger } from "@libp2p/logger";
import dotenv from "dotenv";

dotenv.config();

const bootnode = multiaddr(
  "/ip4/10.217.185.19/tcp/10000/p2p/12D3KooWQGcjo96Ag3uLqWHk8z6aMzH1oLY1NFBUJRhEcZN2zmVm"
);

const nodes = [];

for (let i = 0; i < 5; i++) {
  (async () => {
    const node = await createLibp2p({
      addresses: {
        listen:
          i === 0
            ? [
                multiaddr(
                  `/ip4/0.0.0.0/tcp/${process.env.PORT || 4001}`
                ).toString(),
              ]
            : [multiaddr(`/ip4/0.0.0.0/tcp/0`).toString()],
      },
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [mplex(), yamux()],
      services: {
        ping: ping({
          protocolPrefix: "rebackk",
        }),
        kadDHT: kadDHT({
          peerInfoMapper: removePublicAddressesMapper,
          clientMode: false,
        }),
        identify: identify(),
      },
      peerDiscovery: [
        bootstrap({
          list: [bootnode.toString()],
        }),
      ],
      logger: {
        forComponent: (comp) => logger(`rebackk:${comp}`),
      },
      nodeInfo: {
        version: "1.0.0",
        name: "rebackk",
      },
    });

    await node.start();

    if (i === 0) {
      node.getMultiaddrs().map((addr) => {
        nodes.push(addr);
      });
    } else {
      await Promise.all(
        nodes.map(async (addr) => {
          try {
            await node.dial(addr);
          } catch (err) {
            console.log(err);
          }
        })
      );
    }

    const bootNodePeerId = multiaddr(bootnode).getPeerId();
    if (bootNodePeerId === null) {
      // console.log("Bootnode is invalid");
    } else {
      // console.log("Bootnode is valid");
      node.peerStore.save(peerIdFromString(bootNodePeerId), {
        multiaddrs: [bootnode],
      });
    }

    node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`Node ${i} Connection established to:`, peerId.toString()); // Emitted when a peer has been found
    });

    node.addEventListener("peer:discovery", (evt) => {
      const peerInfo = evt.detail;
      console.log(`Node ${i} Discovered:`, peerInfo.id.toString());

      peerInfo.multiaddrs.map((addr) => {
        node
          .dial(addr)
          .catch((err) => {
            console.log(err);
          })
          .then(() => {
            console.log(
              `Node ${i} Connection established to:`,
              peerInfo.id.toString()
            );
          });
      });
    });

    await Promise.all(
      nodes.map(async (addr) => {
        try {
          await node.services.ping.ping(addr);
        } catch (err) {
          console.log(err);
        }
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));
  })();
}
