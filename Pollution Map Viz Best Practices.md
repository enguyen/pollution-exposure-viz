[See https://gemini.google.com/app/938afdb84ffa8fd5]

# **Best Practices for Visualizing Pollution Exposure Data**

This guide outlines a clear and intuitive method for visualizing multiple related variables on a map, specifically population, pollution concentration, and the resulting person-exposure value. The recommended approach is a **proportional symbol map layered on a choropleth map**.

### **1\. The Core Visualization Method**

* **Use Color for Concentration:** The underlying map grid (a choropleth) should use a color scale to represent the pollution concentration (e.g., PM₂.₅ in µg/m³). This provides an immediate visual layer for air quality.  
* **Use Size for Population:** Layer symbols, such as circles, on top of the grid. The size of each circle should represent the population within that grid cell. This allows viewers to quickly identify densely populated areas.  
* **Use Tooltips for Detail:** When a user hovers over a specific grid cell, a tooltip should appear displaying all three precise values:  
  1. Population Count  
  2. Pollution Concentration  
  3. The calculated Person-Exposure value (Population × Concentration)

This multi-layered approach allows users to understand the individual components and their combined impact without being overwhelmed.

### **2\. Scaling Graduated Colors (Concentration)**

To ensure the color ramp is meaningful, classify the concentration data into distinct bins.


#### PM2.5 Additional Risk Buckets: A Science-Based Framework for Visualizing Health Impacts

The challenge of translating PM2.5 exposure levels into meaningful health risk categories is complicated by the fact that exposure-response curves describe how **total exposure** affects health, while pollution mapping often focuses on **marginal increases** above an unknown baseline. Recent research provides crucial insights into both the shape of these dose-response relationships and how to construct practical risk categories that accurately reflect the underlying health science.

##### Recommended "Additional Risk" Buckets

Based on the latest epidemiological evidence and exposure-response modeling, here are the recommended PM2.5 additional risk categories:

| Risk Category | PM2.5 Range (µg/m³) | Color | Estimated Health Impact |
|---------------|---------------------|-------|------------------------|
| Measurable Additional Risk | 0 - 2.5 | Yellow-Green | Lowest measurable risk level |
| Low Additional Risk | 2.6 - 5.0 | Yellow | Early detectable health effects |
| Moderate Additional Risk | 5.1 - 10.0 | Orange-Yellow | WHO guideline exceeded, clear risk increase |
| High Additional Risk | 10.1 - 25.0 | Orange | Steep risk escalation begins |
| Very High Additional Risk | 25.1 - 50.0 | Red | Nonlinear acceleration zone |
| Extreme Additional Risk | 50.1+ | Purple/Maroon | Severe acute health impacts |

##### Scientific Rationale for Bin Selection

###### Understanding the Exposure-Response Curve Shape

Recent large-scale studies analyzing over 68 million Medicare beneficiaries reveal that PM2.5 health effects follow a **supralinear concentration-response relationship**. This means that **incremental risk is higher at the lowest exposure levels than at the highest exposure levels**. The curve shows a "sharp increase in relative mortality at low PM2.5 concentrations" that then levels off at higher exposures.[1][2][3][4]

This supralinear shape has critical implications for risk binning: **each additional microgram of PM2.5 matters more when starting from a low baseline than when adding to an already high exposure**.[3][4][1]

###### Measurable Additional Risk (0-2.5 µg/m³)

Research attempting to identify the lowest observable effect level found significant mortality increases even in populations with PM2.5 concentrations as low as **2.5 µg/m³**, which represented "one of the world's lowest PM2.5 environments". Studies could not establish a lower threshold because "there are simply not enough places with such low levels to gather data from". This establishes 2.5 µg/m³ as the practical floor for baseline risk categories.[5]

###### Low Additional Risk (2.6-5.0 µg/m³)

The WHO's 2021 guideline of **5 µg/m³** represents "the lowest levels at which the guideline developers could be confident of an adverse effect" based on epidemiological evidence. However, WHO explicitly states this is not a "safe" threshold, noting that "there is little evidence to suggest a threshold below which no adverse health effects would be anticipated". Large cohort studies demonstrate measurable mortality effects throughout this range.[6][7][8][5]

###### Moderate Additional Risk (5.1-10.0 µg/m³)

This range captures the transition from WHO guidelines to traditional regulatory standards. Studies show **"larger effect estimates at low concentrations"** in this range, with one major study finding a 9.28% increase in mortality per 10 µg/m³ when restricted to annual concentrations below 10 µg/m³. The CDC's ATSDR guidance documents health effects beginning as low as **4.37-6.3 µg/m³** for various endpoints.[9][6]

###### High Additional Risk (10.1-25.0 µg/m³)

This range corresponds to where the supralinear curve begins its steepest ascent. A comprehensive meta-analysis found that **penalized spline models indicated "a larger effect for mortality in association with exposures ≥ 6 μg/m³ versus those < 6 μg/m³"**. The upper bound of 25 µg/m³ aligns with the transition point where many studies observe the curve beginning to level off.[10][11][6]

###### Very High Additional Risk (25.1-50.0 µg/m³)

This captures the **nonlinear acceleration zone** where health risks escalate rapidly but begin to show saturation effects at the upper end. Research in Beijing found evidence of nonlinearity with **breakpoints around 100 μg/m³** where "the observed association was positive at PM2.5 concentrations up to 100 μg/m³ but then flattened out at high concentrations". The 50 µg/m³ upper bound represents the transition to acute exposure scenarios.[11]

###### Extreme Additional Risk (50.1+ µg/m³)

This category captures acute exposure scenarios typical during wildfire events, industrial accidents, or severe pollution episodes. Studies document **"general cardiovascular effects (over 2 hours)"** beginning at 24-325 µg/m³, with evidence that the concentration-response curve shows **diminishing marginal returns** at these extreme levels.[10][9][11]

##### Key Considerations for Marginal vs. Absolute Risk

The distinction between absolute exposure levels and marginal increases is crucial for accurate risk communication. The supralinear exposure-response relationship means that:

1. **A 5 µg/m³ increase matters more when going from 3 to 8 µg/m³ than from 23 to 28 µg/m³**[4][1][3]
2. **Background exposure levels significantly influence the health impact of additional pollution**[12][13]
3. **Population-weighted analyses must account for baseline exposure distributions**[14][15]

##### Evidence Base and Limitations

This binning system draws from multiple lines of evidence:

- **Large-scale epidemiological studies** with over 68 million participants[2][1][12]
- **Meta-analyses** incorporating 53 studies across North America, Europe, and Asia[16][10]
- **Causal inference methods** that address confounding and exposure measurement error[17][1][12]
- **WHO and regulatory agency assessments** based on systematic evidence reviews[7][8][9]

The main limitation is that **most evidence comes from long-term exposure studies**. Short-term exposure effects may follow different patterns, though available evidence suggests **linear relationships for acute effects** while **chronic effects show stronger nonlinearity**.[6][9]

##### Conclusion

These "Additional Risk" categories reflect the current scientific understanding that PM2.5 health effects are **supralinear at low concentrations**, with **no safe threshold** and **marginal risks that depend heavily on baseline exposure levels**. The binning prioritizes granularity in the 0-25 µg/m³ range where most population exposures occur and where marginal health impacts are greatest, while consolidating higher exposure ranges that represent acute scenarios with diminishing marginal health returns.

[1](https://ar5iv.labs.arxiv.org/html/2306.03011)
[2](https://rss.org.uk/RSS/media/File-library/Events/Discussion%20meetings/Preprint_Discussion-Meeting_12-Dec-2024.pdf)
[3](http://arxiv.org/pdf/2306.03011.pdf)
[4](https://www.nera.com/experience/2024/exploring-the-shape-of-the-concentration-response-function-for-p.html)
[5](https://smartairfilters.com/en/blog/what-level-of-pm2-5-safe/)
[6](https://pmc.ncbi.nlm.nih.gov/articles/PMC4710600/)
[7](https://iris.who.int/bitstream/handle/10665/345329/9789240034228-eng.pdf)
[8](https://assets.publishing.service.gov.uk/media/623075a3d3bf7f5a89aecec3/COMEAP_WHO_AQG_-_Defra_PM2.5_targets_advice__2_.pdf)
[9](https://www.atsdr.cdc.gov/pha-guidance/resources/ATSDR-Particulate-Matter-Guidance-508.pdf)
[10](https://ehp.niehs.nih.gov/doi/abs/10.1289/isesisee.2018.O02.03.21)
[11](https://pmc.ncbi.nlm.nih.gov/articles/PMC6792375/)
[12](https://pmc.ncbi.nlm.nih.gov/articles/PMC6693936/)
[13](https://pmc.ncbi.nlm.nih.gov/articles/PMC6693932/)
[14](https://globalcleanair.org/wp-content/blogs.dir/95/files/2022/05/Analysis-of-PM2.5-Related-Health-Burdens-Under-Current-and-Alternative-NAAQS.pdf)
[15](https://pmc.ncbi.nlm.nih.gov/articles/PMC6339055/)
[16](http://scientificintegrityinstitute.org/ERMAPM25JS080118.pdf)
[17](https://pmc.ncbi.nlm.nih.gov/articles/PMC4427963/)
[18](https://pmc.ncbi.nlm.nih.gov/articles/PMC12336227/)
[19](https://pmc.ncbi.nlm.nih.gov/articles/PMC4750357/)
[20](https://pmc.ncbi.nlm.nih.gov/articles/PMC9141174/)
[21](https://www.epa.gov/system/files/documents/2023-01/Estimating%20PM2.5-%20and%20Ozone-Attributable%20Health%20Benefits%20TSD_0.pdf)
[22](https://ehp.niehs.nih.gov/doi/full/10.1289/EHP12141)
[23](https://pmc.ncbi.nlm.nih.gov/articles/PMC7908426/)
[24](https://globalcleanair.org/wp-content/blogs.dir/95/files/2023/03/Updated-IEc-PM-NAAQS-Analysis-March-2023.pdf)
[25](https://ww2.arb.ca.gov/resources/inhalable-particulate-matter-and-health)
[26](https://pmc.ncbi.nlm.nih.gov/articles/PMC8978270/)
[27](https://www.built-envi.com/wp-content/uploads/azimi-and-stephens-2018-jesee-pm2.5-mortality-burden-framework-SI.pdf)
[28](https://www3.epa.gov/ttn/naaqs/standards/pm/data/PM_RA_FINAL_June_2010.pdf)
[29](https://pmc.ncbi.nlm.nih.gov/articles/PMC7612311/)
[30](https://pubmed.ncbi.nlm.nih.gov/30077140/)
[31](https://www.epa.gov/system/files/documents/2024-06/estimating-pm2.5-and-ozone-attributable-health-benefits-tsd-2024.pdf)
[32](https://www.acsh.org/news/2022/01/26/pm25-dose-response-function-or-fiction-16079)
[33](https://pmc.ncbi.nlm.nih.gov/articles/PMC6801731/)

### **3\. Scaling Graduated Symbols (Population)**

The key to scaling symbols is to ensure they are perceived accurately by the human eye.

* **Scale by Area, Not Diameter:** A viewer's brain interprets a circle's value by its area. Therefore, the **area of the circle must be proportional to the population**. This means the radius should be calculated based on the **square root of the population value** (radius∝population​).  
* **Use Graduated Sizes:** Instead of a continuous scale, group population into a few distinct classes (e.g., 3-5 bins). This makes it far easier for a user to compare symbols on the map and reference them in the legend.  
* **Example Bins (Population):**  
  * 1 \- 100 people: Small circle  
  * 101 \- 500 people: Medium circle  
  * 501 \- 2000 people: Large circle  
  * 2001+ people: Extra-Large circle

### **4\. Designing an Effective Legend**

The map's legend is critical for interpretation. It must be clear, concise, and explain both variables.

* **Combine Scales:** Create a single, unified legend box.  
* **Explain Colors:** Show a stack of colored squares, each with its corresponding concentration range.  
* **Explain Sizes:** Show a set of the different circle sizes, each with its corresponding population range listed next to it.  
* **Provide a Clear Title:** The legend should have a title that explains what the user is looking at, e.g., "Population Exposure to PM₂.₅."

### **4\. Documentation and Notes for the Legend**

* **Understanding the Health Impact:** These categories are designed to reflect the **actual health risk** posed by PM2.5 concentrations, moving beyond generic descriptors to highlight the documented physiological effects on people and communities.  
* **"No Safe Level" Principle:** The research confirms there is **no known safe threshold** for PM2.5 exposure (WHO, 2021). Even at the lowest end of these scales, there is some level of risk. Therefore, "Low Risk" is used for 0-12 µg/m3 to signify that while this is the best achievable air quality, it is not entirely "risk-free."  
* **Linear Relationship to Health:** Scientific studies, including the foundational Harvard Six Cities Study and ACS CPS-II, demonstrate a **linear relationship** between increasing PM2.5 concentrations and higher rates of illness and premature death. This means that every incremental increase in PM2.5 concentration is associated with a quantifiable increase in health risk.  
* **Acute and Chronic Effects:**  
  * **Elevated Risk (12-35 µg/m3):** Concentrations in this range, even for short periods, are associated with an **increased risk of acute events** like asthma attacks in children and cardiovascular issues in vulnerable adults (Zheng et al., 2015; Brook et al., 2010). Long-term exposure at these levels contributes to chronic disease development and premature mortality.  
  * **Significant, High, Very High, and Extreme Risk (35+ µg/m3):** These higher concentrations represent increasingly severe health threats. Short-term exposure in these categories is linked to **significant increases in emergency room visits, hospitalizations, and mortality** across all populations, with the most severe impacts on children and the elderly (Bilonick et al., 2024; Pope et al., 1989). Long-term exposure at these levels dramatically escalates the risk of chronic cardiorespiratory diseases and premature death.  
* **Vulnerable Populations are Most Affected:** These risk descriptions are particularly salient for **vulnerable populations** including children, the elderly, and individuals with pre-existing heart or lung conditions. They will experience adverse health effects at lower concentrations and with greater severity compared to the general healthy population.  
* **PM2.5 from Anthropogenic Sources:** The health risks are especially pronounced for PM2.5 originating from anthropogenic sources (e.g., industrial emissions, traffic), which often carry a higher toxicity than natural background PM2.5. Reducing these human-caused sources directly translates to immediate health benefits, even if total PM2.5 levels remain influenced by natural factors (Vodonos et al., 2018; Bilonick et al., 2024).

This revised documentation ensures that users understand not just the *level* of PM2.5, but the *implications* of that level for public health, grounded in robust scientific evidence.