# ExpressJS API Example

This is an [ExpressJS](https://expressjs.com/) server written in [TypeScript](https://www.typescriptlang.org/) for a [CopilotKit Backend](https://www.copilotkit.ai/).

## ✨ Features

- Deploy-ready for [Railway](railway.app)
- Express
- TypeScript
- CORS Setup
- Winston Logger
- [CopilotKit](https://www.copilotkit.ai/)

## 💁‍♀️ How to use

- Install dependencies `yarn` or `npm`
- Connect to your Railway project `railway link`
- Start the development server `railway run yarn dev`

## 📝 Notes

The server code is located in `src/index.ts`. Returns a healthcheck '`Server is up and running`'.

I used [Railway](railway.app) to host the backend for CopilotKit for my application. If you use Railway, your layout.tsx should look similar to the example below.

Please follow the excellent [guide](https://docs.copilotkit.ai/getting-started/quickstart-textarea) for [CopilotKit](https://www.copilotkit.ai/). After you have followed the guide, your layout.tsx file should look this:

 ``` typescript
 <html lang="en">
      <body className={`${inter.variable} ${inter_tight.variable} font-inter antialiased bg-white text-zinc-900 tracking-tight`}>
        <div className="flex flex-col min-h-screen overflow-hidden supports-[overflow:clip]:overflow-clip">
        <CopilotKit url="https://your-railway-domain-here.railway.app/api/v1/chat">
          <CopilotSidebar labels={{
            title: "CopilotKit",
            initial: "Hi! 👋 How can I assist you today?",
            }}
            >
          {children}
          </CopilotSidebar>
        </CopilotKit>
        </div>
      </body>
    </html>
```

Don't forget to update your OPENAI_API_KEY and ORIGIN variables in the .env file for dev and in Railway for production. The PORT variable doesn't require updating.

## Disclaimer

I did not create or develop CopilotKit in any way - I simply wanted to use it with my application and thought I should make it easier for others to use it.

## 👏 Thanks

- [CopilotKit](https://www.copilotkit.ai/)
- [Railway](railway.app)

- [Gadsdencode](https://github.com/gadsdencode) / Railway team for the [original template](https://github.com/railwayapp-templates/expressjs)
