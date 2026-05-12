import base64
import httpx

API_BASE = "https://aiproxy-api.backoffice.bagelgames.com"


class ImageClient:
    async def generate(
        self,
        api_token: str,
        prompt: str,
        model: str = "gpt-image-1.5",
        size: str = "1536x1024",
        background: str = "auto",
    ) -> str:
        """Returns base64-encoded PNG string."""
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "prompt": prompt,
            "model": model,
            "n": 1,
            "size": size,
            "background": background,
        }

        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{API_BASE}/openai/v1/images/generations",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            img = data["data"][0]
            if "b64_json" in img and img["b64_json"]:
                return img["b64_json"]
            elif "url" in img:
                img_resp = await client.get(img["url"], timeout=60.0)
                img_resp.raise_for_status()
                return base64.b64encode(img_resp.content).decode()
            else:
                raise ValueError(f"Unexpected response: {img}")
