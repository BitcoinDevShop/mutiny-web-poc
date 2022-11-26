import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import Close from "../components/Close";
import PageTitle from "../components/PageTitle";
import ScreenMain from "../components/ScreenMain";
import { useSearchParams } from "react-router-dom";
import { NodeManagerContext } from "@components/GlobalStateProvider";
import toast from "react-hot-toast";
import { detectPaymentType, getFirstNode, PaymentType, toastAnything } from "@util/dumb";
import MutinyToaster from "@components/MutinyToaster";
import { useQuery } from "@tanstack/react-query";
import prettyPrintAmount from "@util/prettyPrintAmount";
import { timeout } from "workbox-core/_private";

function SendConfirm() {
  const nodeManager = useContext(NodeManagerContext);

  const [sentOnchain, setSentOnchain] = useState(false)
  const [sentKeysend, setSentKeysend] = useState(false)
  const [sentInvoice, setSentInvoice] = useState(false)
  const [searchParams] = useSearchParams();
  const [txid, setTxid] = useState<string>();

  const [loading, setLoading] = useState(false);

  const amount = searchParams.get("amount")
  const destination = searchParams.get("destination")
  const description = searchParams.get("description")

  searchParams.forEach((value, key) => {
    console.log(key, value);
  });

  const { data: invoice } = useQuery({
    queryKey: ['lightninginvoice'],
    queryFn: () => {
      console.log("Decoding invoice...")
      return nodeManager?.decode_invoice(destination!);
    },
    enabled: !!(destination && nodeManager && detectPaymentType(destination) === PaymentType.invoice),
    refetchOnWindowFocus: false
  })

  async function handleSend() {
    setLoading(true);
    try {
      if (destination && amount) {
        let amountInt = BigInt(amount);
        if (typeof amountInt !== "bigint") {
          toast("Couldn't parse amount")
          throw new Error("Invalid amount")
        }

        const paymentType = detectPaymentType(destination);

        if (paymentType === PaymentType.onchain) {
          const txid = await nodeManager?.send_to_address(destination, amountInt);
          await nodeManager?.sync();
          setTxid(txid)
          setSentOnchain(true);
        } else if (paymentType === PaymentType.keysend) {
          let myNode = await getFirstNode(nodeManager!);
          await nodeManager?.keysend(myNode, destination, amountInt)
          setSentKeysend(true);
        } else if (paymentType === PaymentType.invoice) {
          let myNode = await getFirstNode(nodeManager!);
          let invoice = await nodeManager?.decode_invoice(destination);
          if (invoice?.amount_sats && Number(invoice?.amount_sats) > 0) {
            await nodeManager?.pay_invoice(myNode, destination)
          } else {
            await nodeManager?.pay_invoice(myNode, destination, BigInt(amount))
          }
          setSentInvoice(true);
        }
      }
    } catch (e: unknown) {
      console.error(e);
      toastAnything(e);
      await timeout(5000)
      navigate("/")
      return
    }

    setLoading(false);
  }

  let navigate = useNavigate();

  function handleNice() {
    navigate("/")
  }

  return (
    <>
      <header className='p-8 flex justify-between items-center'>
        <PageTitle title="Confirm" theme="green" />
        <Close />
      </header>
      {loading && <ScreenMain>
        <div />
        <p className="text-2xl font-light">Sending...</p>
        <div />
      </ScreenMain>
      }
      {!loading && (sentKeysend || sentInvoice) &&
        <ScreenMain>
          <div />
          <p className="text-2xl font-light">Sent!</p>
          <div className='flex justify-start'>
            <button onClick={handleNice}>Nice</button>
          </div>
        </ScreenMain>
      }
      {!loading && sentOnchain &&
        <ScreenMain>
          <div />
          <p className="text-2xl font-light">Sent!</p>
          <dl>
            <div className="rounded border p-2 my-2 font-mono break-words">
              <dt>TXID</dt>
              <dd>
                {txid}
              </dd>
            </div>
          </dl>
          <div className='flex justify-start'>
            <button onClick={handleNice}>Nice</button>
          </div>
        </ScreenMain>
      }
      {!loading && invoice && !sentInvoice &&
        <ScreenMain>
          <div />
          <p className="text-2xl font-light">How does this look to you?</p>
          <dl>
            {invoice.payee_pubkey ?
              <div className="rounded border p-2 my-2">
                <dt>Who</dt>
                <dd className="font-mono break-words">{invoice.payee_pubkey}</dd>
              </div>
              :
              <div className="rounded border p-2 my-2">
                <dt>Payment Hash</dt>
                <dd className="font-mono break-words">{invoice.payment_hash}</dd>
              </div>
            }

            <div className="rounded border p-2 my-2">
              <>
                <dt>How Much</dt>
                {amount &&
                  <dd>{prettyPrintAmount(parseInt(amount!))} sats</dd>
                }
                {(!amount && invoice.amount_sats) &&
                  <dd>{prettyPrintAmount(invoice.amount_sats)} sats</dd>
                }
              </>
            </div>
            {invoice.description &&
              <div className="rounded border p-2 my-2 flex flex-col">
                <dt>What For</dt>
                <dd>{invoice.description}</dd>
                <button className="self-end" onClick={() => console.log("Unimplemented")}>Edit</button>
              </div>
            }
          </dl>
          <div className='flex justify-start'>
            <button onClick={handleSend}>Send</button>
          </div>
        </ScreenMain>
      }
      {!loading && !sentOnchain && !sentKeysend && !invoice &&
        <ScreenMain>
          <div />
          <p className="text-2xl font-light">How does this look to you?</p>
          <dl>
            <div className="rounded border p-2 my-2">
              <dt>Who</dt>
              <dd className="font-mono break-words">{destination}</dd>
            </div>
            {amount &&
              <div className="rounded border p-2 my-2">
                <dt>How Much</dt>
                <dd>{prettyPrintAmount(parseInt(amount))} sats</dd>
              </div>
            }
            {description &&
              <div className="rounded border p-2 my-2 flex flex-col">
                <dt>What For</dt>
                <dd>{description}</dd>
                <button className="self-end" onClick={() => console.log("Unimplemented")}>Edit</button>
              </div>
            }
          </dl>
          <div className='flex justify-start'>
            <button onClick={handleSend}>Send</button>
          </div>
        </ScreenMain>
      }
      <MutinyToaster />
    </>

  );
}

export default SendConfirm;
