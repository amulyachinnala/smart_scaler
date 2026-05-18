import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as cheerio from 'cheerio';

function App() {
    const [multiplier, setMultiplier] = useState(1);
    const [recipeURL, setRecipeURL] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [ingredients, setIngredients] = useState([
        { name: 'All-Purpose Flour (Sample)', quantity: 2, unit: 'cups' },
        { name: 'Cold Unsalted Butter (Sample)', quantity: 8, unit: 'tbsp' },
        { name: 'Baking Powder (Sample)', quantity: 1, unit: 'tbsp' }
    ]);
    const [constraints, setConstraints] = useState({});

    // helper: AI refinement logic
    const refineWithAI = async (rawText) => {
        const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
        if (!apiKey) return null;

        try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
            model: "gpt-3.5-turbo",
            messages: [{
                role: "system", 
                content: "Convert recipe ingredient text into a JSON object with keys: quantity (number), unit (string), and name (string). Convert all fractions to decimals. If no quantity is found, use 1."
            }, {
                role: "user", 
                content: rawText
            }],
            temperature: 0
            },
            { headers: { 'Authorization': `Bearer ${apiKey}` } }
        );
        return JSON.parse(response.data.choices[0].message.content);
        } catch (error) {
            return null;
        }
    };

    const parseIngredientLocal = (text) => {
        const match = text.match(/^(\d+\/?\d*)\s*(\w+)?\s*(.*)$/);
        if (match) {
        return {
            quantity: eval(match[1].replace('/', '/')) || 1,
            unit: match[2] || '',
            name: match[3] || text
        };
        }
        return { quantity: 1, unit: '', name: text };
    };

    const handleScrape = async () => {
        if (!recipeURL) return alert("Please paste a URL first! 🥧");
        setLoadingMessage('Connecting to kitchen... 🔍');

        try {
            // fetch HTML using proxy to avoid CORS errors
            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(recipeURL);
            const { data } = await axios.get(proxyUrl);
            
            // load HTML into Cheerio to search
            const $ = cheerio.load(data);
            let rawStrings = [];

            // search for <script> tag with the specific type "application/ld+json"
            setLoadingMessage('Reading recipe metadata... 📚');
            const ldJsonScript = $('script[type="application/ld+json"]').html();
            
            if (ldJsonScript) {
                const jsonData = JSON.parse(ldJsonScript);
                
                // find object where '@type' is 'Recipe'
                // (Recipes can be in a list, a graph, or the root object)
                const recipeData = Array.isArray(jsonData) 
                ? jsonData.find(obj => obj['@type'] === 'Recipe') 
                : jsonData['@graph'] 
                    ? jsonData['@graph'].find(obj => obj['@type'] === 'Recipe')
                    : jsonData['@type'] === 'Recipe' ? jsonData : null;

                if (recipeData && recipeData.recipeIngredient) {
                    rawStrings = recipeData.recipeIngredient;
                }
            }

            if (rawStrings.length === 0) {
                setLoadingMessage('Scanning page elements... 🖥️');
                
                // target common class names used by popular recipe plugins
                $('.recipe-ingredients li, .wprm-recipe-ingredient, .ingredients-item, .entry-content ul li').each((i, el) => {
                    const text = $(el).text().replace(/\s+/g, ' ').trim();
                    
                    // add if it starts with a number
                    if (text.match(/^\d/)) {
                        rawStrings.push(text);
                    }
                });
            }

            if (rawStrings.length > 0) {
                setLoadingMessage('Refining measurements with AI... ✨');
                const finalResults = await Promise.all(rawStrings.map(async (text) => {
                // Broad trigger for slashes, mixed numbers, or special symbols
                if (text.match(/\//) || text.match(/[¼½¾⅓⅔⅛⅜⅝⅞]/) || text.match(/\d+\s+\d+/)) {
                    const aiRes = await refineWithAI(text);
                    return aiRes ? aiRes : parseIngredientLocal(text);
                }
                return parseIngredientLocal(text);
                }));

                setIngredients(finalResults);
                setMultiplier(1);
            }
        } catch (error) {
            alert("Failed to fetch the recipe.");
        } finally {
            setLoadingMessage('');
        }
    };
}

export default App;