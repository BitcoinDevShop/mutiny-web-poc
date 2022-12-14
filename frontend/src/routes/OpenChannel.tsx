import ActionButton from "@components/ActionButton";
import AmountInput from "@components/AmountInput";
import { NodeManagerContext } from "@components/GlobalStateProvider";
import MutinyToaster from "@components/MutinyToaster";
import { getFirstNode, toastAnything } from "@util/dumb";
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import Close from "../components/Close";
import PageTitle from "../components/PageTitle";
import { inputStyle, mainWrapperStyle } from "../styles";


export default function OpenChannel() {
	const { nodeManager } = useContext(NodeManagerContext);
	let navigate = useNavigate();

	const [peerPubkey, setPeerPubkey] = useState("");
	const [channelAmount, setAmount] = useState("")

	async function handleSubmit(e: React.SyntheticEvent) {
		e.preventDefault()
		const amount = channelAmount.replace(/_/g, "")
		if (amount.match(/\D/)) {
			setAmount('')
			toastAnything("That doesn't look right")
			return
		}
		try {
			const myNode = await getFirstNode(nodeManager!);

			let amountBig = BigInt(amount)

			if (typeof amountBig !== "bigint") {
				throw new Error("Didn't get a usable amount")
			}

			let mutinyChannel = await nodeManager?.open_channel(myNode, peerPubkey, amountBig)

			console.log("MUTINY CHANNEL")
			console.table(mutinyChannel)

			navigate("/manager/channels")
		} catch (e) {
			console.error(e)
			toastAnything(e)
		}
	}

	return (
		<>
			<header className='p-8 flex justify-between items-center'>
				<PageTitle title="Open Channel" theme="blue"></PageTitle>
				<Close to="/manager/channels" />
			</header>

			<main>
				<form onSubmit={handleSubmit} className={mainWrapperStyle()}>
					<div />
					<p className="text-2xl font-light">Let's do this!</p>
					<div className="flex flex-col gap-4">
						<input onChange={(e) => setPeerPubkey(e.target.value)} className={`w-full ${inputStyle({ accent: "blue" })}`} type="text" placeholder='Target node pubkey' />
						<AmountInput amountSats={channelAmount} setAmount={setAmount} accent="blue" placeholder="How big?" />
					</div>
					<ActionButton>Create</ActionButton>
				</form>
			</main>
			<MutinyToaster />

		</>
	)
}
