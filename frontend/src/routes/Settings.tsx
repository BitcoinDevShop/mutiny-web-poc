import { NodeManagerContext } from "@components/GlobalStateProvider";
import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import Close from "../components/Close"
import PageTitle from "../components/PageTitle"
import ScreenMain from "../components/ScreenMain"

function Settings() {
    const nodeManager = useContext(NodeManagerContext);

    const { isLoading, data: words } = useQuery({
        queryKey: ['words'],
        queryFn: () => {
            console.log("Getting mnemonic...")
            return nodeManager?.show_seed();
        },
        enabled: !!nodeManager,
    })

    function handleSave() {
        let serializable: Record<string, any> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            serializable[key!] = JSON.parse(localStorage.getItem(key!)!);
        }
        console.log(serializable)

        saveTemplateAsFile("mutiny_wallet_backup.json", serializable)
    }

    // https://stackoverflow.com/questions/19721439/download-json-object-as-a-file-from-browser
    const saveTemplateAsFile = (filename: string, dataObjToWrite: Record<string, any>) => {
        const blob = new Blob([JSON.stringify(dataObjToWrite)], { type: "text/json" });
        const link = document.createElement("a");

        link.download = filename;
        link.href = window.URL.createObjectURL(blob);
        link.dataset.downloadurl = ["text/json", link.download, link.href].join(":");

        const evt = new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true,
        });

        link.dispatchEvent(evt);
        link.remove()
    };

    function handleFileChoose(e: React.ChangeEvent) {
        const fileReader = new FileReader();
        const target = e.target as HTMLInputElement;
        const file: File = (target.files as FileList)[0];
        fileReader.readAsText(file, "UTF-8");
        fileReader.onload = e => {
            const text = e.target?.result?.toString();
            const newStorage = JSON.parse(text!);

            console.log(newStorage)

            for (let i = 0; i < newStorage.length; i++) {
                const key = newStorage.key(i)
                localStorage.setItem(key, newStorage[key]);
            }
        };
    };

    return (
        <>
            <header className='px-8 pt-8 flex justify-between items-center'>
                <PageTitle title="Settings" theme="red" />
                <Close />
            </header>
            <ScreenMain padSides={false} wontScroll={true}>
                <div className="flex flex-col gap-4 flex-1 overflow-y-scroll px-8 pb-[12rem] items-start">
                    <div>
                        <p className="text-2xl font-light">Write down these words or you'll die!</p>
                        <pre>
                            <code>{isLoading ? "..." : words}</code>
                        </pre>
                    </div>

                    <button onClick={handleSave}>Save State As File</button>

                    <input type="file" onChange={handleFileChoose} />
                </div>
            </ScreenMain>
        </>
    )
}

export default Settings