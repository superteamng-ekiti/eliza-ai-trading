// src/actions.ts
import {
  addParametersToDescription,
  getTools
} from "@goat-sdk/core";
import {
  generateText,
  ModelClass,
  composeContext,
  generateObjectV2
} from "@ai16z/eliza";
async function getOnChainActions({
  wallet,
  plugins
}) {
  const tools = await getTools({
    wallet,
    plugins,
    wordForTool: "action"
  });
  return tools.map((action) => ({
    ...action,
    name: action.name.toUpperCase()
  })).map((tool) => createAction(tool));
}
function createAction(tool) {
  return {
    name: tool.name,
    similes: [],
    description: tool.description,
    validate: async () => true,
    handler: async (runtime, message, state, options, callback) => {
      try {
        let currentState = state ?? await runtime.composeState(message);
        currentState = await runtime.updateRecentMessageState(currentState);
        const parameterContext = composeParameterContext(
          tool,
          currentState
        );
        const parameters = await generateParameters(
          runtime,
          parameterContext,
          tool
        );
        const parsedParameters = tool.parameters.safeParse(parameters);
        if (!parsedParameters.success) {
          callback?.({
            text: `Invalid parameters for action ${tool.name}: ${parsedParameters.error.message}`,
            content: { error: parsedParameters.error.message }
          });
          return false;
        }
        const result = await tool.method(parsedParameters.data);
        const responseContext = composeResponseContext(
          tool,
          result,
          currentState
        );
        const response = await generateResponse(
          runtime,
          responseContext
        );
        callback?.({ text: response, content: result });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        callback?.({
          text: `Error executing action ${tool.name}: ${errorMessage}`,
          content: { error: errorMessage }
        });
        return false;
      }
    },
    examples: []
  };
}
function composeParameterContext(tool, state) {
  const contextTemplate = `{{recentMessages}}

Given the recent messages, extract the following information for the action "${tool.name}":
${addParametersToDescription("", tool.parameters)}
`;
  return composeContext({ state, template: contextTemplate });
}
async function generateParameters(runtime, context, tool) {
  const { object } = await generateObjectV2({
    runtime,
    context,
    modelClass: ModelClass.LARGE,
    schema: tool.parameters
  });
  return object;
}
function composeResponseContext(tool, result, state) {
  const responseTemplate = `
    # Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

The action "${tool.name}" was executed successfully.
Here is the result:
${JSON.stringify(result)}

{{actions}}

Respond to the message knowing that the action was successful and these were the previous messages:
{{recentMessages}}
  `;
  return composeContext({ state, template: responseTemplate });
}
async function generateResponse(runtime, context) {
  return generateText({
    runtime,
    context,
    modelClass: ModelClass.LARGE
  });
}

// src/wallet.ts
import { Connection } from "@solana/web3.js";
import { crossmint } from "@goat-sdk/crossmint";
async function getWalletClientAndConnection(getSetting) {
  const apiKey = getSetting("CROSSMINT_API_KEY");
  if (!apiKey) {
    throw new Error("Missing CROSSMINT_API_KEY variable");
  }
  const email = getSetting("CROSSMINT_EMAIL");
  if (!email) {
    throw new Error("Missing CROSSMINT_EMAIL variable");
  }
  const env = getSetting("CROSSMINT_ENV");
  if (!env) {
    throw new Error("Missing CROSSMINT_ENV variable");
  }
  const RPC_URL = getSetting("RPC_URL");
  if (!RPC_URL) {
    throw new Error("Missing RPC_URL variable");
  }
  const { custodial } = crossmint(apiKey);
  const connection = new Connection(RPC_URL, "confirmed");
  return {
    walletClient: await custodial({
      chain: "solana",
      email,
      env,
      connection
    }),
    connection
  };
}
function getWalletProvider(walletClient) {
  return {
    async get() {
      try {
        const address = walletClient.getAddress();
        const balance = await walletClient.balanceOf(address);
        return `Solana Wallet Address: ${address}
Balance: ${balance} SOL`;
      } catch (error) {
        console.error("Error in Solana wallet provider:", error);
        return null;
      }
    }
  };
}

// src/index.ts
import { splToken } from "@goat-sdk/plugin-spl-token";
async function createCrossmintPlugin(getSetting) {
  const { walletClient, connection } = await getWalletClientAndConnection(getSetting);
  if (!walletClient) {
    throw new Error("Wallet client not found");
  }
  console.log("walletClient", walletClient);
  const actions = await getOnChainActions({
    wallet: walletClient,
    // Add plugins here based on what actions you want to use
    // See all available plugins at https://ohmygoat.dev/chains-wallets-plugins#plugins
    plugins: [
      // Add you solana plugins here
      splToken({
        connection,
        network: "mainnet"
      })
      // coingecko({
      //  apiKey: getSetting("COINGECKO_API_KEY")
      // })
    ]
  });
  return {
    name: "[Crossmint] Solana Onchain Actions",
    description: "Crossmint Solana integration plugin",
    providers: [getWalletProvider(walletClient)],
    evaluators: [],
    services: [],
    actions
  };
}
var src_default = createCrossmintPlugin;
export {
  src_default as default
};
//# sourceMappingURL=index.js.map