use std::collections::HashMap;
use std::{str::FromStr, sync::Arc};

use crate::keymanager;
use crate::node::Node;
use crate::{localstorage::MutinyBrowserStorage, utils::set_panic_hook, wallet::MutinyWallet};
use bdk::wallet::AddressIndex;
use bip39::Mnemonic;
use bitcoin::consensus::deserialize;
use bitcoin::hashes::hex::FromHex;
use bitcoin::{Network, Transaction};
use futures::lock::Mutex;
use lightning::chain::chaininterface::BroadcasterInterface;
use log::{error, info};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct NodeManager {
    mnemonic: Mnemonic,
    network: Network,
    wallet: MutinyWallet,
    storage: MutinyBrowserStorage,
    node_storage: Mutex<NodeStorage>,
    nodes: Arc<Mutex<HashMap<String, Arc<Node>>>>,
}

// This is the NodeStorage object saved to the DB
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct NodeStorage {
    pub nodes: HashMap<String, NodeIndex>,
}

// This is the NodeIndex reference that is saved to the DB
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct NodeIndex {
    pub uuid: String,
    pub child_index: u32,
}

// This is the NodeIdentity that refer to a specific node
// Used for public facing identification.
#[wasm_bindgen]
pub struct NodeIdentity {
    uuid: String,
    pubkey: String,
}

#[wasm_bindgen]
impl NodeIdentity {
    #[wasm_bindgen(getter)]
    pub fn uuid(&self) -> String {
        self.uuid.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn pubkey(&self) -> String {
        self.pubkey.clone()
    }
}

#[wasm_bindgen]
impl NodeManager {
    #[wasm_bindgen]
    pub fn has_node_manager() -> bool {
        MutinyBrowserStorage::has_mnemonic()
    }

    #[wasm_bindgen(constructor)]
    pub fn new(password: String, mnemonic: Option<String>) -> NodeManager {
        set_panic_hook();

        // TODO get network from frontend
        let network = Network::Testnet;

        let storage = MutinyBrowserStorage::new(password);

        let mnemonic = match mnemonic {
            Some(m) => {
                let seed = Mnemonic::from_str(String::as_str(&m))
                    .expect("could not parse specified mnemonic");
                storage.insert_mnemonic(seed)
            }
            None => storage.get_mnemonic().unwrap_or_else(|_| {
                let seed = keymanager::generate_seed();
                storage.insert_mnemonic(seed)
            }),
        };

        let wallet = MutinyWallet::new(mnemonic.clone(), storage.clone(), network);

        let node_storage = MutinyBrowserStorage::get_nodes().expect("could not retrieve node keys");

        NodeManager {
            mnemonic,
            network,
            wallet,
            storage,
            node_storage: Mutex::new(node_storage),
            nodes: Arc::new(Mutex::new(HashMap::new())), // TODO init the nodes
        }
    }

    #[wasm_bindgen]
    pub fn broadcast_transaction(&self, str: String) {
        let tx_bytes = Vec::from_hex(str.as_str()).unwrap();
        let tx: Transaction = deserialize(&tx_bytes).unwrap();

        self.wallet.broadcast_transaction(&tx)
    }

    #[wasm_bindgen]
    pub fn show_seed(&self) -> String {
        self.mnemonic.to_string()
    }

    #[wasm_bindgen]
    pub async fn get_new_address(&self) -> String {
        self.wallet
            .wallet
            .lock()
            .await
            .get_address(AddressIndex::New)
            .unwrap()
            .address
            .to_string()
    }

    #[wasm_bindgen]
    pub async fn get_wallet_balance(&self) -> u64 {
        self.wallet
            .wallet
            .lock()
            .await
            .get_balance()
            .unwrap()
            .get_total()
    }

    #[wasm_bindgen]
    pub async fn send_to_address(
        &self,
        destination_address: String,
        amount: u64,
        fee_rate: Option<f32>,
    ) -> String {
        let txid = self
            .wallet
            .send(destination_address, amount, fee_rate)
            .await
            .expect("Failed to send");
        txid.to_owned().to_string()
    }

    #[wasm_bindgen]
    pub async fn sync(&self) {
        self.wallet.sync().await.expect("Wallet failed to sync")
    }

    #[wasm_bindgen]
    pub async fn new_node(&self) -> NodeIdentity {
        create_new_node_from_node_manager(self).await
    }

    #[wasm_bindgen]
    pub async fn connect_to_peer(
        &self,
        self_node_pubkey: String,
        websocket_proxy_addr: String,
        connection_string: String,
    ) {
        if let Some(node) = self.nodes.lock().await.get(&self_node_pubkey) {
            let res = node
                .connect_peer(websocket_proxy_addr, connection_string.clone())
                .await;
            match res {
                Ok(_) => {
                    info!("connected to peer: {connection_string}")
                }
                Err(e) => {
                    error!("could not connect to peer: {connection_string} - {e}")
                }
            };
        } else {
            error!("could not find internal node {self_node_pubkey}")
        }
    }
}

// This will create a new node with a node manager and return the PublicKey of the node created.
pub(crate) async fn create_new_node_from_node_manager(node_manager: &NodeManager) -> NodeIdentity {
    // Begin with a mutex lock so that nothing else can
    // save or alter the node list while it is about to
    // be saved.
    let mut node_mutex = node_manager.node_storage.lock().await;

    // Get the current nodes and their bip32 indices
    // so that we can create another node with the next.
    // Always get it from our storage, the node_mutex is
    // mostly for read only and locking.
    let mut existing_nodes = MutinyBrowserStorage::get_nodes().expect("could not retrieve nodes");
    let next_node_index = match existing_nodes
        .nodes
        .iter()
        .max_by_key(|(_, v)| v.child_index)
    {
        None => 0,
        Some((_, v)) => v.child_index + 1,
    };

    // Create and save a new node using the next child index
    let next_node_uuid = Uuid::new_v4().to_string();
    let next_node = NodeIndex {
        uuid: next_node_uuid.clone(),
        child_index: next_node_index,
    };

    existing_nodes
        .nodes
        .insert(next_node_uuid.clone(), next_node.clone());

    MutinyBrowserStorage::insert_nodes(existing_nodes.clone()).expect("could not insert nodes");
    node_mutex.nodes = existing_nodes.nodes.clone();

    // now create the node process and init it
    let new_node = Node::new(
        next_node.clone(),
        node_manager.mnemonic.clone(),
        node_manager.storage.clone(),
        node_manager.network,
    )
    .expect("could not initialize node");

    let node_pubkey = new_node.pubkey;
    node_manager
        .nodes
        .clone()
        .lock()
        .await
        .insert(node_pubkey.clone().to_string(), Arc::new(new_node));

    NodeIdentity {
        uuid: next_node.uuid.clone(),
        pubkey: node_pubkey.clone().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use crate::keymanager::generate_seed;
    use crate::nodemanager::NodeManager;

    use crate::test::*;

    use wasm_bindgen_test::{wasm_bindgen_test as test, wasm_bindgen_test_configure};

    wasm_bindgen_test_configure!(run_in_browser);

    #[test]
    fn create_node_manager() {
        log!("creating node manager!");

        assert!(!NodeManager::has_node_manager());
        NodeManager::new("password".to_string(), None);
        assert!(NodeManager::has_node_manager());

        cleanup_test();
    }

    #[test]
    fn correctly_show_seed() {
        log!("showing seed");

        let seed = generate_seed();
        let nm = NodeManager::new("password".to_string(), Some(seed.to_string()));

        assert!(NodeManager::has_node_manager());
        assert_eq!(seed.to_string(), nm.show_seed());

        cleanup_test();
    }

    #[test]
    async fn created_new_nodes() {
        log!("creating new nodes");

        let seed = generate_seed();
        let nm = NodeManager::new("password".to_string(), Some(seed.to_string()));

        {
            let node_identity = nm.new_node().await;
            let node_storage = nm.node_storage.lock().await;
            assert_ne!("", node_identity.uuid);
            assert_ne!("", node_identity.pubkey);
            assert_eq!(1, node_storage.nodes.len());

            let retrieved_node = node_storage.nodes.get(&node_identity.uuid).unwrap();
            assert_eq!(0, retrieved_node.child_index);
        }

        {
            let node_identity = nm.new_node().await;
            let node_storage = nm.node_storage.lock().await;

            assert_ne!("", node_identity.uuid);
            assert_ne!("", node_identity.pubkey);
            assert_eq!(2, node_storage.nodes.len());

            let retrieved_node = node_storage.nodes.get(&node_identity.uuid).unwrap();
            assert_eq!(1, retrieved_node.child_index);
        }

        cleanup_test();
    }
}
